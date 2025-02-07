import * as core from "@actions/core";
import * as aws from "@aws-sdk/client-elastic-beanstalk";
import { S3Client, PutObjectAclCommand } from "@aws-sdk/client-s3";
import { createReadStream } from "fs";
import { basename } from "path";

async function run(): Promise<void> {
  try {
    //get command inputs
    const awsAccessKeyId = core.getInput("aws-access-key-id", { required: true });
    const awsSecretAccessKey = core.getInput("aws-secret-access-key", { required: true });
    const awsRegion = core.getInput("aws-region", { required: true });
    const applicationName = core.getInput("application-name", { required: true });
    const environmentName = core.getInput("environment-name", { required: true });
    const versionLabel = core.getInput("version-label", { required: true });
    const bucketName = core.getInput("bucket-name", { required: false });
    const deplymentPackage = core.getInput("deployment-package", { required: true });

    // configure AWS SDK
    const credentials = {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    };

    const elasticBeanstalkClient = new aws.ElasticBeanstalkClient({
      region: awsRegion,
      credentials
    });

    const s3Client = new S3Client({
      region: awsRegion,
      credentials
    });

    // configure s3 bucket
    const s3Bucket = bucketName || `elasticbeanstalk-${awsRegion}-${awsAccessKeyId.substring(0, 12)}`;
    const s3Key = `${applicationName}/${basename(deplymentPackage)}`;
    core.info(`Successfully configured bucket ${s3Bucket}`);

    // upload package to s3
    core.info("Uploading file to S3...");
    const putObjectParams = {
      Bucket: s3Bucket,
      Key: s3Key,
      Body: createReadStream(deplymentPackage), //TODO: Check if this override still works for the action
      ContentType: "application/zip",
    }
    const command = new PutObjectAclCommand(putObjectParams);
    await s3Client.send(command);
    core.info("Successfully uploaded file to S3");

    // create App version
    const appVersionParams = {
      ApplicationName: applicationName,
      VersionLabel: versionLabel,
      SourceBundle: {
        S3Bucket: s3Bucket,
        S3Key: s3Key,
      },
      AutoCreateApplication: false,
      Process: true,
    }
    const appVersionCommand = new aws.CreateApplicationVersionCommand(appVersionParams);
    await elasticBeanstalkClient.send(appVersionCommand);
    core.info(`Successfully set app version to ${versionLabel}`);

    // Update Environment
    const updateEnvironmentParams = {
      ApplicationName: applicationName,
      EnvironmentName: environmentName,
      VersionLabel: versionLabel,
    }
    const updateEnvcommand = new aws.UpdateEnvironmentCommand(updateEnvironmentParams);
    await elasticBeanstalkClient.send(updateEnvcommand);

    core.info(`Successfully deployed ${deplymentPackage} to ${applicationName} ${environmentName} on ${awsRegion}`);

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(`Unknown error: ${error}`);
    }
  }
}

run();
