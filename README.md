# JollyRipper Plugin Directory

Git-based plugin registry for JollyRipper. No server needed - just JSON files.

## How to Submit a Plugin

### 1. Create your plugin JSON file

Filename format: `plugins/{username}-{plugin-name}.json`

Example: `plugins/yourname-example-plugin.json`

```json
{
  "id": "yourname-example-plugin",
  "name": "Example Plugin",
  "version": "1.0.0",
  "description": "What your plugin does",
  "author": "yourname",
  "repository": "https://github.com/yourname/JollyRipper-Plugin-Example",
  "homepage": "https://github.com/yourname/JollyRipper-Plugin-Example",
  "thumbnail": "https://raw.githubusercontent.com/yourname/JollyRipper-Plugin-Example/main/thumbnail.png",
  "tags": ["example", "utility"]
}
```

**Required fields:** `id`, `name`, `version`, `description`, `author`, `repository`

**Optional fields:** `homepage`, `thumbnail`, `tags`, `downloadUrl`

**Rules:**
- All URLs must NOT end with `.git`
- `thumbnail` must be `thumbnail.png`, `thumbnail.jpg`, or `thumbnail.gif` (max 512x512, max 2MB)

**Important:**
- Filename must start with your username: `{username}-`
- Plugin `id` must match filename (without .json)
- `author` field must match your GitHub username

### 2. Create a Pull Request

Push your branch and create a PR. GitHub Actions will automatically:
- Validate your submission
- Post approval comment if valid
- Auto-merge and update the plugin index

That's it! Your plugin will be available immediately after merge.

## Updating or Removing

- **Update:** Create PR with modified JSON (version bump required)
- **Remove:** Create PR deleting your plugin JSON file

You can only modify/remove plugins you authored.

## Plugin Discovery

JollyRipper fetches plugins from:

```
https://raw.githubusercontent.com/MatesMediaDev/JollyRipper-PluginsDirectory/main/plugins/index.json
```

## Plugin Development

See the [JollyRipper Plugin Documentation](https://github.com/MatesMediaDev/JollyRipper) for creating plugins.
