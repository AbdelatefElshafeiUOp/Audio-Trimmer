const ffmpeg = require('fluent-ffmpeg');

module.exports = function createVideo(audioPath, imagePath, outputPath) {
  return new Promise((resolve, reject) => {
    // First, get the exact duration of the audio file.
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) {
        console.error("ffprobe error:", err);
        return reject(new Error(`Could not probe audio file: ${audioPath}`));
      }
      
      const audioDuration = metadata.format.duration;
      if (!audioDuration || audioDuration <= 0) {
        return reject(new Error(`Invalid audio duration detected for ${audioPath}`));
      }

      ffmpeg()
        .input(imagePath)
        .loop() // Loop the image indefinitely
        .input(audioPath)
        .outputOptions([
          '-c:v libx264',      // Video codec
          '-tune stillimage',  // Optimize for static images
          '-c:a aac',          // Audio codec
          '-b:a 192k',         // Set a good audio bitrate
          '-pix_fmt yuv420p',  // Pixel format for compatibility
          '-t', audioDuration, // *** THE KEY CHANGE: Set output duration to match audio exactly ***
        ])
        .on('start', (commandLine) => console.log('FFmpeg createVideo command:', commandLine))
        .on('error', (err, stdout, stderr) => {
            console.error('FFMPEG STDERR:', stderr);
            reject(new Error(`Error creating video segment: ${err.message}`));
        })
        .on('end', () => resolve())
        .save(outputPath);
    });
  });
};