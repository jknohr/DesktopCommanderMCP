import { spawn } from 'bun';
import path from 'path';
import fs from 'fs/promises';
import { validatePath } from './filesystem.js';
import {capture} from "../utils/capture.js";

// Type definition for search results
export interface SearchResult {
  file: string;
  line: number;
  match: string;
}

// Common search options interface
export interface SearchOptions {
  rootPath: string;        // Directory to search in
  pattern: string;         // Text/regex pattern to search for
  filePattern?: string;    // Optional file pattern (e.g., "*.ts")
  ignoreCase?: boolean;    // Case insensitive search
  maxResults?: number;     // Limit number of results
  includeHidden?: boolean; // Whether to include hidden files
  contextLines?: number;   // Number of context lines before and after matches
  excludeDirs?: string[]; // Directories to exclude from search
}

// Function to search file contents using native Linux tools (grep + find)
export async function searchCode(options: SearchOptions): Promise<SearchResult[]> {
  const { 
    rootPath, 
    pattern, 
    filePattern, 
    ignoreCase = true, 
    maxResults = 1000, 
    includeHidden = false,
    contextLines = 0,
    excludeDirs = ['node_modules', '.git', 'dist', 'build', 'coverage']
  } = options;
  
  // Validate path for security
  const validPath = await validatePath(rootPath);
  
  // Build find command to get list of files
  const findArgs = [validPath];
  
  // Add file pattern if specified
  if (filePattern) {
    findArgs.push('-name', filePattern);
  }
  
  // Exclude directories
  excludeDirs.forEach(dir => {
    findArgs.push('-not', '-path', `*/${dir}/*`);
  });

  // Hide permission denied errors
  findArgs.push('2>/dev/null');
  
  // Hide hidden files unless explicitly included
  if (!includeHidden) {
    findArgs.push('-not', '-path', '*/.*');
  }

  try {
    // Get list of files using find
    const findCmd = ['find', ...findArgs].join(' ');
    const fileListProc = spawn(['bash', '-c', findCmd], {
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const fileList = await new Response(fileListProc.stdout).text();
    
    if (!fileList.trim()) {
      return []; // No files found
    }

    // Build grep command
    const grepArgs = [
      '-n',  // Show line numbers
      ignoreCase ? '-i' : '', // Case insensitive if specified
      contextLines > 0 ? `-C${contextLines}` : '', // Add context lines if specified
      pattern
    ].filter(Boolean); // Remove empty args

    // Use xargs to handle long file lists
    const grepCmd = `xargs grep ${grepArgs.join(' ')}`;
    
    // Run grep on the file list
    const proc = spawn(['bash', '-c', `echo "${fileList}" | ${grepCmd}`], {
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();

    // grep exits with 1 if no matches found, which is normal
    if (proc.exitCode !== 0 && proc.exitCode !== 1) {
      if (error.includes('Permission denied')) {
        capture('server_request_error', {
          error: 'Permission denied accessing some files during search'
        });
      } else {
        throw new Error(`Search failed: ${error}`);
      }
    }

    const results: SearchResult[] = [];
    const lines = output.trim().split('\n');

    for (const line of lines) {
      if (!line) continue;

      // Parse grep output format: file:line:content
      const [file, lineNum, ...rest] = line.split(':');
      if (!file || !lineNum) continue;

      results.push({
        file,
        line: parseInt(lineNum, 10),
        match: rest.join(':').trim()
      });

      if (results.length >= maxResults) {
        break;
      }
    }

    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    capture('server_request_error', {
      error: `Search error: ${errorMessage}`
    });
    throw error;
  }
}

// Main search function (removed fallback since we're using native tools)
export async function searchTextInFiles(options: SearchOptions): Promise<SearchResult[]> {
  return searchCode(options);
}
