#!/usr/bin/env node

/**
 * @license
 * ISC License
 * 
 * Copyright (c) 2023 KhulnaSoft, Ltd
 * 
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

const fs = require('fs');
const path = require('path');

// Define the license header
const licenseHeader = `/**
 * @license
 * ISC License
 * 
 * Copyright (c) 2023 KhulnaSoft, Ltd
 * 
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

`;

// Function to check if a file already has a license header
function hasLicenseHeader(content) {
  // Check for common license indicators
  return (
    content.includes('@license') || 
    content.includes('ISC License') || 
    content.includes('Copyright') ||
    content.includes('Permission to use, copy, modify')
  );
}

// Function to add license header to a file
function addLicenseToFile(filePath) {
  console.log(`Processing: ${filePath}`);
  
  try {
    // Read the file content
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Skip if the file already has a license header
    if (hasLicenseHeader(content)) {
      console.log(`  ⏭️  Skipping: License header already exists`);
      return false;
    }
    
    // Add the license header at the beginning of the file
    const newContent = licenseHeader + content;
    
    // Write the updated content back to the file
    fs.writeFileSync(filePath, newContent);
    console.log(`  ✅ Added license header`);
    return true;
  } catch (error) {
    console.error(`  ❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

// Function to recursively find all JavaScript files
function findJavaScriptFiles(directory) {
  let jsFiles = [];
  
  const items = fs.readdirSync(directory, { withFileTypes: true });
  
  for (const item of items) {
    const itemPath = path.join(directory, item.name);
    
    // Skip node_modules and .git directories
    if (item.isDirectory() && 
        item.name !== 'node_modules' && 
        item.name !== '.git') {
      jsFiles = jsFiles.concat(findJavaScriptFiles(itemPath));
    } else if (item.isFile() && item.name.endsWith('.js')) {
      jsFiles.push(itemPath);
    }
  }
  
  return jsFiles;
}

// Main function
function main() {
  console.log('Starting to add license headers to JavaScript files...');
  
  // Find all JavaScript files in the current directory and subdirectories
  const jsFiles = findJavaScriptFiles('.');
  
  console.log(`Found ${jsFiles.length} JavaScript files`);
  
  // Stats to track progress
  let processed = 0;
  let skipped = 0;
  let updated = 0;
  let errors = 0;
  
  // Process each file
  for (const filePath of jsFiles) {
    // Skip index.js as it already has the header
    if (path.basename(filePath) === 'index.js') {
      console.log(`Skipping index.js: Already has license header`);
      skipped++;
      continue;
    }
    
    try {
      const wasUpdated = addLicenseToFile(filePath);
      if (wasUpdated) {
        updated++;
      } else {
        skipped++;
      }
      processed++;
    } catch (error) {
      console.error(`Error processing ${filePath}:`, error.message);
      errors++;
    }
  }
  
  // Print summary
  console.log('\nSummary:');
  console.log(`Total JavaScript files: ${jsFiles.length}`);
  console.log(`Processed: ${processed}`);
  console.log(`Updated with license header: ${updated}`);
  console.log(`Skipped (already had license or is index.js): ${skipped}`);
  console.log(`Errors: ${errors}`);
}

// Run the main function
main();

