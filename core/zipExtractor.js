const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');

async function extractZip(zipPath, outputDir) {
  if (!fs.existsSync(zipPath)) {
    throw new Error('ZIP file not found');
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const fileTree = [];

    fs.createReadStream(zipPath)
      .pipe(unzipper.Parse())
      .on('entry', function (entry) {
        const filePath = path.join(outputDir, entry.path);

        if (entry.type === 'Directory') {
          fs.mkdirSync(filePath, { recursive: true });
          entry.autodrain();
        } else {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          entry.pipe(fs.createWriteStream(filePath));
          fileTree.push(filePath);
        }
      })
      .on('close', () => {
        resolve(fileTree);
      })
      .on('error', (err) => reject(err));
  });
}

module.exports = {
  extractZip,
};
