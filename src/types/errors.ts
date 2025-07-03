export class AzureMCPError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "AzureMCPError";
  }
}

export class AzureAuthenticationError extends AzureMCPError {
  constructor(message: string) {
    super(message, "AUTH_FAILED");
  }
}

export class AzureResourceError extends AzureMCPError {
  constructor(message: string) {
    super(message, "RESOURCE_ERROR");
  }
}

export class AzureValidationError extends AzureMCPError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
  }
}
