import {
    searchTextInFiles
} from '../tools/search.js';

import {
    SearchCodeArgsSchema
} from '../tools/schemas.js';

import { handleEditBlock } from '../tools/edit.js';
import { ServerResult } from '../types.js';
import { capture } from '../utils/capture.js';
import { withTimeout } from '../utils/withTimeout.js';

// Export handleEditBlock without modification
export { handleEditBlock };

/**
 * Handle search_code command with improved Linux process management
 */
export async function handleSearchCode(args: unknown): Promise<ServerResult> {
    const parsed = SearchCodeArgsSchema.parse(args);
    const timeoutMs = parsed.timeoutMs || 30000; // 30 seconds default

    try {
        // Start search with timeout
        const results = await withTimeout(
            searchTextInFiles({
                rootPath: parsed.path,
                pattern: parsed.pattern,
                filePattern: parsed.filePattern,
                ignoreCase: parsed.ignoreCase,
                maxResults: parsed.maxResults,
                includeHidden: parsed.includeHidden,
                contextLines: parsed.contextLines
            }),
            timeoutMs,
            'Code search operation',
            [] // Empty array as default on timeout
        );

        // Handle empty results case
        if (results.length === 0) {
            return {
                content: [{
                    type: "text", 
                    text: timeoutMs > 0 
                        ? `No matches found or search timed out after ${timeoutMs}ms.`
                        : "No matches found"
                }]
            };
        }

        // Format results using Linux-style file paths
        let currentFile = "";
        let formattedResults = "";

        results.forEach(result => {
            if (result.file !== currentFile) {
                formattedResults += `\n${result.file}:\n`;
                currentFile = result.file;
            }
            formattedResults += `  ${result.line}: ${result.match}\n`;
        });

        return {
            content: [{
                type: "text", 
                text: formattedResults.trim()
            }]
        };
    } catch (error) {
        // Enhanced error handling
        const errorMessage = error instanceof Error ? error.message : String(error);
        capture('server_request_error', { error: errorMessage });
        
        return {
            content: [{
                type: "text",
                text: `Search failed: ${errorMessage}`
            }],
            isError: true
        };
    }
}