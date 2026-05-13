const fs = require('fs');
const path = require('path');

async function loadProjectContext(filePath) {
  try {
    const absolutePath = path.join(__dirname, '..', filePath);

    if (!fs.existsSync(absolutePath)) {
      return null;
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');

    return {
      file: filePath,
      content
    };
  } catch (err) {
    console.error(err);
    return null;
  }
}

module.exports = {
  loadProjectContext
};