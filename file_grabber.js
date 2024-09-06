const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const pdfDirectories = ['C:\\Users\\bharg\\Downloads']; // Add more directories as needed

const outputZipFilePath = 'pdfs_collected.zip';

// Create a new ZIP archive
const output = fs.createWriteStream(outputZipFilePath);
const archive = archiver('zip', {
    zlib: { level: 9 } // Set compression level
});

// Pipe the output file stream to the archive
archive.pipe(output);

// Function to recursively find PDF files in a directory
function findPDFFiles(directoryPath) {
    fs.readdirSync(directoryPath).forEach(file => {
        const filePath = path.join(directoryPath, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            findPDFFiles(filePath); // Recursively search subdirectories
        } else if (path.extname(filePath).toLowerCase() === '.pdf') {
            console.log('Adding:', filePath);
            archive.file(filePath, { name: path.relative(pdfDirectories[0], filePath) }); // Add file to archive
        }
    });
}

// Start searching for PDF files in each specified directory
pdfDirectories.forEach(directory => {
    findPDFFiles(directory);
});

// Finalize the archive (zip it up)
archive.finalize();

// Log completion message when the archive is finalized
output.on('close', () => {
    console.log(`Archive created: ${outputZipFilePath}`);
});

// Handle archive errors
archive.on('error', err => {
    throw err;
});
