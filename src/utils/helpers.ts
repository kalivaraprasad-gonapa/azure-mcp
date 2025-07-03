import { Project, SyntaxKind } from "ts-morph";
import { AzureMCPError } from "../types/errors";

export function wrapUserCode(userCode: string): string {
  try {
    // Sanitize user code to prevent certain patterns
    const sanitizedCode = userCode
      .replace(/process\.env/g, "/* process.env access blocked */")
      .replace(/require\s*\(/g, "/* require blocked */")
      .replace(/import\s+.*\s+from/g, "/* import blocked */");

    const project = new Project({
      useInMemoryFileSystem: true,
    });
    const sourceFile = project.createSourceFile("userCode.ts", sanitizedCode);
    const lastStatement = sourceFile.getStatements().pop();

    if (
      lastStatement &&
      lastStatement.getKind() === SyntaxKind.ExpressionStatement
    ) {
      const returnStatement = lastStatement.asKind(
        SyntaxKind.ExpressionStatement
      );
      if (returnStatement) {
        const expression = returnStatement.getExpression();
        sourceFile.addStatements(`return ${expression.getText()};`);
        returnStatement.remove();
      }
    }
    return sourceFile.getFullText();
  } catch (error) {
    throw new AzureMCPError(
      "Failed to process user code",
      "CODE_WRAP_FAILED"
    );
  }
}

export function createTextResponse(text: string) {
  try {
    // If the input is already a JSON string, parse and reconstruct it properly
    const parsed = JSON.parse(text);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(parsed),
        },
      ],
    };
  } catch {
    // If it's not valid JSON, clean up the string and format it properly
    const cleanText = text
      // Remove ANSI escape codes
      .replace(
        /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
        ""
      )
      // Remove log level indicators
      .replace(/\[info\]|\[error\]|\[warn\]/g, "")
      // Remove any potential HTML/XML-like tags
      .replace(/<[^>]*>/g, "")
      // Clean up extra whitespace
      .replace(/\s+/g, " ")
      .trim();

    // Ensure we're returning a valid MCP response format
    return {
      content: [
        {
          type: "text",
          text: cleanText,
        },
      ],
    };
  }
}

export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  retries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (i < retries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, delayMs * (i + 1))
        );
      }
    }
  }

  throw lastError || new Error("Operation failed after retries");
}
