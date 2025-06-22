const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

/**
 * Concatenates multiple video files into a single output file using the 'concat' filter,
 * which is more memory-efficient than mergeToFile.
 *
 * @param {string[]} inputPaths - An array of paths to the video files to concatenate.
 * @param {string} outputPath - The path for the final concatenated video.
 * @returns {Promise<void>} A promise that resolves when concatenation is complete.
 */
module.exports = function concatenateVideos(inputPaths, outputPath) {
    return new Promise((resolve, reject) => {
        if (!inputPaths || inputPaths.length === 0) {
            return reject(new Error('No input videos provided for concatenation.'));
        }

        // The concat filter requires a text file listing the inputs.
        const fileListPath = path.join(path.dirname(outputPath), `concat-list-${Date.now()}.txt`);
        
        // The content of the file should be in the format: file '/path/to/video.mp4'
        // FFmpeg has path escaping issues, so we use a sanitized relative path.
        const fileContent = inputPaths
            .map(p => `file '${path.basename(p)}'`)
            .join('\n');
        
        fs.writeFileSync(fileListPath, fileContent);

        ffmpeg()
            .input(fileListPath)
            .inputOptions([
                '-f concat', // Specify the concat format
                '-safe 0'    // Allow unsafe file paths (necessary for this method)
            ])
            .outputOptions([
                '-c copy'    // Copy streams without re-encoding, which is fast and preserves quality
            ])
            .on('start', (commandLine) => console.log('FFmpeg concatenation command:', commandLine))
            .on('error', (err, stdout, stderr) => {
                // On error, delete the temporary list file
                fs.unlink(fileListPath, () => {});
                console.error('FFMPEG STDERR:', stderr); // Log detailed ffmpeg errors
                reject(new Error(`Error during concatenation: ${err.message}`));
            })
            .on('end', () => {
                // On success, delete the temporary list file
                fs.unlink(fileListPath, () => {});
                resolve();
            })
            .save(outputPath);
    });
};