"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AzureServer_1 = require("../../AzureServer");
describe('Azure Integration Tests', () => {
    let server;
    beforeAll(async () => {
        server = new AzureServer_1.AzureMCPServer();
        await server.start();
    });
    it('should list tenants and subscriptions', async () => {
        const result = await server['handleListTenants']();
        const response = JSON.parse(result.content[0].text);
        expect(response).toHaveProperty('tenants');
        expect(response).toHaveProperty('subscriptions');
        expect(Array.isArray(response.tenants)).toBeTruthy();
        expect(Array.isArray(response.subscriptions)).toBeTruthy();
    });
    it('should execute simple Azure query', async () => {
        const tenantId = process.env.AZURE_TENANT_ID;
        const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
        if (!tenantId || !subscriptionId) {
            console.warn('Skipping test: No Azure credentials provided');
            return;
        }
        const args = {
            reasoning: 'List resource groups',
            code: 'const groups = []; for await (const group of resourceClient.resourceGroups.list()) { groups.push(group.name); } return groups;',
            tenantId,
            subscriptionId
        };
        const result = await server['handleRunAzureCode'](args);
        const response = JSON.parse(result.content[0].text);
        expect(Array.isArray(response)).toBeTruthy();
    });
});
