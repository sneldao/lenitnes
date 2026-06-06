param location string = resourceGroup().location
param projectName string = 'lenitnes'
param env string = 'prod'

// Database ----------------------------------------------------
resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: '${projectName}-postgres-${env}'
  location: location
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '15'
    administratorLogin: 'lenitnes_admin'
    administratorPassword: uniqueString(resourceGroup().id, subscription().id)
    storage: { storageSizeGB: 32 }
    highAvailability: { mode: 'Disabled' }
  }
}

resource postgresFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: postgresServer
  name: 'AllowAllAzureIPs'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '255.255.255.255'
  }
}

resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: postgresServer
  name: 'lenitnes'
}

// Container Registry ------------------------------------------
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${projectName}cr${env}'
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: true }
}

// Log Analytics -----------------------------------------------
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${projectName}-logs-${env}'
  location: location
  properties: { sku: { name: 'PerGB2018' } }
}

// Container Apps Environment ----------------------------------
resource containerAppEnv 'Microsoft.App/managedEnvironments@2023-11-02-preview' = {
  name: '${projectName}-env-${env}'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: { customerId: logAnalytics.properties.customerId, sharedKey: logAnalytics.listKeys().primarySharedKey }
    }
  }
}

// API Container App -------------------------------------------
resource apiApp 'Microsoft.App/containerApps@2023-11-02-preview' = {
  name: '${projectName}-api-${env}'
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 4000
        transport: 'auto'
        allowInsecure: false
      }
      secrets: [
        { name: 'database-url', value: 'postgresql://${postgresServer.properties.administratorLogin}:${postgresServer.properties.administratorPassword}@${postgresServer.properties.fullyQualifiedDomainName}:5432/lenitnes?sslmode=require' }
        { name: 'jwt-secret', value: uniqueString(resourceGroup().id, subscription().id, 'jwt') }
      ]
      registries: [
        { server: containerRegistry.properties.loginServer, username: containerRegistry.name, passwordSecretRef: 'registry-password' }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${containerRegistry.properties.loginServer}/lenitnes-api:latest'
          env: [
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'JWT_SECRET', secretRef: 'jwt-secret' }
            { name: 'PORT', value: '4000' }
            { name: 'NODE_ENV', value: 'production' }
          ]
          resources: { cpu: 0.5, memory: '1Gi' }
        }
      ]
      scale: { minReplicas: 0, maxReplicas: 3 }
    }
  }
  dependsOn: [postgresDb]
}

// Worker Container App ----------------------------------------
resource workerApp 'Microsoft.App/containerApps@2023-11-02-preview' = {
  name: '${projectName}-worker-${env}'
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: { external: false }
      secrets: [
        { name: 'database-url', value: 'postgresql://${postgresServer.properties.administratorLogin}:${postgresServer.properties.administratorPassword}@${postgresServer.properties.fullyQualifiedDomainName}:5432/lenitnes?sslmode=require' }
        { name: 'jwt-secret', value: uniqueString(resourceGroup().id, subscription().id, 'jwt') }
      ]
      registries: [
        { server: containerRegistry.properties.loginServer, username: containerRegistry.name, passwordSecretRef: 'registry-password' }
      ]
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: '${containerRegistry.properties.loginServer}/lenitnes-worker:latest'
          env: [
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'JWT_SECRET', secretRef: 'jwt-secret' }
            { name: 'NODE_ENV', value: 'production' }
          ]
          resources: { cpu: 0.25, memory: '0.5Gi' }
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
  dependsOn: [postgresDb]
}

// Static Web App (Frontend) -----------------------------------
resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: '${projectName}-web-${env}'
  location: location
  sku: { name: 'Standard', tier: 'Standard' }
  properties: {
    repositoryUrl: 'https://github.com/sneldao/lenitnes'
    branch: 'main'
    buildProperties: {
      appLocation: 'apps/web'
      outputLocation: 'out'
      apiLocation: ''
    }
  }
}

output apiUrl string = apiApp.properties.configuration.ingress.fqdn
output staticWebAppUrl string = staticWebApp.properties.defaultHostname
output containerRegistryName string = containerRegistry.name
