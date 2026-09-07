const fs = require('node:fs');
const path = require('node:path');

const projectDirectory = path.resolve(__dirname, '..');
const outputDirectory = path.resolve(__dirname, '..', '.firebase');
const googleServicesPath = path.join(projectDirectory, 'google-services.json');
const serviceAccountPath = path.join(
  outputDirectory,
  'firebase-service-account.json',
);

function parseSecret(name, required) {
  const value = process.env[name];

  if (!value) {
    if (required) {
      throw new Error(`${name} is required for this operation.`);
    }
    return null;
  }

  try {
    const json = fs.existsSync(value)
      ? fs.readFileSync(value, 'utf8')
      : value;
    return JSON.parse(json);
  } catch {
    throw new Error(`${name} must contain valid JSON or reference a JSON file.`);
  }
}

function ensureOutputDirectory() {
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
}

function writePrivateJson(filePath, value) {
  ensureOutputDirectory();
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function getFirebaseProjectId(googleServices) {
  const projectId = googleServices?.project_info?.project_id;
  if (typeof projectId !== 'string' || !projectId) {
    throw new Error(
      'GOOGLE_SERVICES_JSON is missing project_info.project_id.',
    );
  }
  return projectId;
}

function validateAndroidClient(googleServices, expectedPackageName) {
  const clients = Array.isArray(googleServices?.client)
    ? googleServices.client
    : [];
  const matchesPackage = clients.some(
    (client) =>
      client?.client_info?.android_client_info?.package_name ===
      expectedPackageName,
  );

  if (!matchesPackage) {
    throw new Error(
      `GOOGLE_SERVICES_JSON does not contain Android package ${expectedPackageName}.`,
    );
  }
}

function writeGoogleServicesJson({ expectedPackageName, required = false }) {
  const secretValue = process.env.GOOGLE_SERVICES_JSON;
  const googleServices = parseSecret('GOOGLE_SERVICES_JSON', required);
  if (!googleServices) return null;

  getFirebaseProjectId(googleServices);
  validateAndroidClient(googleServices, expectedPackageName);

  if (secretValue && fs.existsSync(secretValue)) {
    return secretValue;
  }

  writePrivateJson(googleServicesPath, googleServices);
  return './google-services.json';
}

function writeServiceAccountJson({ expectedPackageName }) {
  const googleServices = parseSecret('GOOGLE_SERVICES_JSON', true);
  const serviceAccount = parseSecret('FIREBASE_SERVICE_ACCOUNT_JSON', true);
  const projectId = getFirebaseProjectId(googleServices);

  validateAndroidClient(googleServices, expectedPackageName);

  if (
    serviceAccount?.type !== 'service_account' ||
    serviceAccount?.project_id !== projectId ||
    typeof serviceAccount?.private_key !== 'string' ||
    typeof serviceAccount?.client_email !== 'string'
  ) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON must be a service-account key for the same Firebase project as GOOGLE_SERVICES_JSON.',
    );
  }

  writePrivateJson(serviceAccountPath, serviceAccount);
  return serviceAccountPath;
}

function cleanGeneratedFiles() {
  fs.rmSync(outputDirectory, { recursive: true, force: true });
  fs.rmSync(googleServicesPath, { force: true });
}

if (require.main === module) {
  const command = process.argv[2];
  const appConfig = require('../app.config.base.json').expo;

  if (command === 'client') {
    writeGoogleServicesJson({
      expectedPackageName: appConfig.android.package,
      required: true,
    });
  } else if (command === 'credentials') {
    writeGoogleServicesJson({
      expectedPackageName: appConfig.android.package,
      required: true,
    });
    writeServiceAccountJson({
      expectedPackageName: appConfig.android.package,
    });
  } else if (command === 'clean') {
    cleanGeneratedFiles();
  } else {
    throw new Error('Expected client, credentials, or clean command.');
  }
}

module.exports = {
  cleanGeneratedFiles,
  writeGoogleServicesJson,
  writeServiceAccountJson,
};