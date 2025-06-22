const ffmpeg = require('fluent-ffmpeg');

module.exports = function trimAudio(inputPath, startTime, endTime, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .output(outputPath)
      .on('end', () => resolve(endTime - startTime))
      .on('error', reject)
      .run();
  });
};
