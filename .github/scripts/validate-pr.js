#!/usr/bin/env node

/**
 * Plugin PR Validator for GitHub Actions
 * 
 * Validates plugin submissions according to the rules:
 * 1. Only modify files in plugins/ directory
 * 2. Only JSON files
 * 3. Valid JSON matching schema
 * 4. Plugin ID matches filename
 * 5. Author matches PR creator (for new plugins)
 * 6. Can only remove own plugins
 * 7. Thumbnail requirements: png/gif/jpg, max 512x512, max 2MB
 */

import { readFile, access } from 'fs/promises';
import { join } from 'path';
import https from 'https';
import http from 'http';

const REQUIRED_FIELDS = ['id', 'name', 'version', 'description', 'author', 'repository'];
const MAX_THUMBNAIL_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_THUMBNAIL_DIMENSIONS = 512;
const ALLOWED_IMAGE_FORMATS = ['png', 'gif', 'jpg', 'jpeg'];

async function validateThumbnail(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Thumbnail URL returned ${res.statusCode}`));
      }
      
      const chunks = [];
      let size = 0;
      
      res.on('data', (chunk) => {
        chunks.push(chunk);
        size += chunk.length;
        
        if (size > MAX_THUMBNAIL_SIZE) {
          res.destroy();
          reject(new Error(`Thumbnail exceeds 2MB limit (${(size / 1024 / 1024).toFixed(2)}MB)`));
        }
      });
      
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        
        const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
        const isJPG = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
        const isGIF = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
        
        if (!isPNG && !isJPG && !isGIF) {
          return reject(new Error('Thumbnail must be PNG, JPG, or GIF format'));
        }
        
        let width, height;
        
        if (isPNG) {
          width = buffer.readUInt32BE(16);
          height = buffer.readUInt32BE(20);
        } else if (isJPG) {
          let offset = 2;
          while (offset < buffer.length) {
            if (buffer[offset] !== 0xFF) break;
            offset++;
            const marker = buffer[offset];
            offset++;
            
            if (marker === 0xC0 || marker === 0xC2) {
              height = buffer.readUInt16BE(offset + 3);
              width = buffer.readUInt16BE(offset + 5);
              break;
            }
            
            const segmentLength = buffer.readUInt16BE(offset);
            offset += segmentLength;
          }
        } else if (isGIF) {
          width = buffer.readUInt16LE(6);
          height = buffer.readUInt16LE(8);
        }
        
        if (width > MAX_THUMBNAIL_DIMENSIONS || height > MAX_THUMBNAIL_DIMENSIONS) {
          return reject(new Error(`Thumbnail dimensions ${width}x${height} exceed ${MAX_THUMBNAIL_DIMENSIONS}x${MAX_THUMBNAIL_DIMENSIONS}`));
        }
        
        resolve({ width, height, size, format: isPNG ? 'PNG' : isJPG ? 'JPG' : 'GIF' });
      });
      
      res.on('error', reject);
    }).on('error', reject);
  });
}

const prAuthor = process.argv[2];
const changedFiles = process.argv[3]?.split('\n').filter(f => f.trim()) || [];

if (!prAuthor) {
  console.error('❌ Error: PR author not provided');
  process.exit(1);
}

console.log(`\n🔍 Validating PR from: ${prAuthor}`);
console.log(`📝 Changed files: ${changedFiles.length}`);

const errors = [];
const added = [];
const removed = [];

for (const file of changedFiles) {
  console.log(`\n📄 Checking: ${file}`);
  
  if (!file.startsWith('plugins/')) {
    errors.push(`❌ File outside plugins/ directory: ${file}`);
    continue;
  }
  
  if (!file.endsWith('.json')) {
    errors.push(`❌ Non-JSON file in plugins/: ${file}`);
    continue;
  }
  
  if (file === 'plugins/index.json') {
    console.log(`⚠️  Note: index.json is auto-generated, should not be manually edited`);
    continue;
  }
  
  const pluginId = file.replace('plugins/', '').replace('.json', '');
  
  if (!pluginId.startsWith(`${prAuthor}-`)) {
    errors.push(`❌ ${file}: Filename must start with your username "${prAuthor}-" (e.g., "${prAuthor}-my-plugin.json")`);
    continue;
  }
  
  const prFilePath = process.env.PR_FILES_DIR ? `${process.env.PR_FILES_DIR}/${file.replace('plugins/', '')}` : file;
  const baseFilePath = file;
  
  let isAdded = false;
  let isRemoved = false;
  
  try {
    await access(prFilePath);
    isAdded = true;
  } catch {
    isRemoved = true;
  }
  
  if (isAdded) {
    try {
      const content = await readFile(prFilePath, 'utf-8');
      const plugin = JSON.parse(content);
      
      let isModification = false;
      let originalAuthor = null;
      
      try {
        const originalContent = await readFile(baseFilePath, 'utf-8');
        const originalPlugin = JSON.parse(originalContent);
        isModification = true;
        originalAuthor = originalPlugin.author;
      } catch {
        isModification = false;
      }
      
      if (isModification) {
        if (originalAuthor !== prAuthor) {
          errors.push(`❌ ${file}: Cannot modify plugin owned by "${originalAuthor}" (you are "${prAuthor}")`);
          continue;
        }
        console.log(`   ℹ️  Modifying existing plugin by ${originalAuthor}`);
      }
      
      for (const field of REQUIRED_FIELDS) {
        if (!plugin[field]) {
          errors.push(`❌ ${file}: Missing required field: ${field}`);
        }
      }
      
      if (plugin.id !== pluginId) {
        errors.push(`❌ ${file}: Plugin ID "${plugin.id}" doesn't match filename "${pluginId}.json"`);
      }
      
      if (plugin.version && !/^\d+\.\d+\.\d+/.test(plugin.version)) {
        errors.push(`❌ ${file}: Invalid version format: ${plugin.version}`);
      }
      
      if (plugin.author !== prAuthor) {
        errors.push(`❌ ${file}: Author "${plugin.author}" must match PR creator "${prAuthor}"`);
      }
      
      if (plugin.repository) {
        try {
          new URL(plugin.repository);
          
          if (plugin.repository.endsWith('.git')) {
            errors.push(`❌ ${file}: Repository URL should not end with .git: ${plugin.repository}`);
          }
        } catch {
          errors.push(`❌ ${file}: Invalid repository URL: ${plugin.repository}`);
        }
      }
      
      if (plugin.homepage) {
        try {
          new URL(plugin.homepage);
          
          if (plugin.homepage.endsWith('.git')) {
            errors.push(`❌ ${file}: Homepage URL should not end with .git: ${plugin.homepage}`);
          }
        } catch {
          errors.push(`❌ ${file}: Invalid homepage URL: ${plugin.homepage}`);
        }
      }
      
      if (plugin.downloadUrl) {
        try {
          new URL(plugin.downloadUrl);
          
          if (plugin.downloadUrl.endsWith('.git')) {
            errors.push(`❌ ${file}: Download URL should not end with .git: ${plugin.downloadUrl}`);
          }
        } catch {
          errors.push(`❌ ${file}: Invalid download URL: ${plugin.downloadUrl}`);
        }
      }
      
      if (plugin.thumbnail) {
        try {
          new URL(plugin.thumbnail);
          
          if (!/\/thumbnail\.(png|jpg|gif)$/i.test(plugin.thumbnail)) {
            errors.push(`❌ ${file}: Thumbnail must be named thumbnail.png, thumbnail.jpg, or thumbnail.gif`);
          }
          
          try {
            const thumbInfo = await validateThumbnail(plugin.thumbnail);
            console.log(`   ✓ Thumbnail: ${thumbInfo.format} ${thumbInfo.width}x${thumbInfo.height} (${(thumbInfo.size / 1024).toFixed(1)}KB)`);
          } catch (thumbErr) {
            errors.push(`❌ ${file}: Thumbnail validation failed: ${thumbErr.message}`);
          }
        } catch {
          errors.push(`❌ ${file}: Invalid thumbnail URL: ${plugin.thumbnail}`);
        }
      }
      
      if (errors.length === 0) {
        added.push(pluginId);
        console.log(`✅ Valid plugin: ${plugin.name}`);
      }
      
    } catch (err) {
      errors.push(`❌ ${file}: ${err.message}`);
    }
    
  } else if (isRemoved) {
    try {
      const originalContent = await readFile(baseFilePath, 'utf-8');
      const originalPlugin = JSON.parse(originalContent);
      
      if (originalPlugin.author !== prAuthor) {
        errors.push(`❌ ${file}: Cannot remove plugin owned by "${originalPlugin.author}" (you are "${prAuthor}")`);
        continue;
      }
      
      removed.push(pluginId);
      console.log(`🗑️  Removed: ${pluginId} (owned by ${prAuthor})`);
    } catch (err) {
      errors.push(`❌ ${file}: Could not verify ownership for removal: ${err.message}`);
    }
  }
}

console.log('\n' + '='.repeat(50));
if (errors.length > 0) {
  console.log('❌ VALIDATION FAILED\n');
  errors.forEach(err => console.log(err));
  console.log('\n📋 Rules:');
  console.log('  1. Only modify files in plugins/ directory');
  console.log('  2. Only JSON files allowed');
  console.log('  3. Must match plugin schema');
  console.log('  4. Plugin ID must match filename');
  console.log('  5. Author field must be your username');
  console.log('  6. Must be valid JSON');
  process.exit(1);
}

console.log('✅ VALIDATION PASSED\n');
if (added.length > 0) {
  console.log(`📦 Added plugins: ${added.join(', ')}`);
}
if (removed.length > 0) {
  console.log(`🗑️  Removed plugins: ${removed.join(', ')}`);
}
console.log('\n✨ This PR is ready to merge!');
process.exit(0);
