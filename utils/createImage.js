const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

const ARABIC_FONT_PATH = path.join(__dirname, 'arabic_font.ttf'); 
const ARABIC_FONT_FAMILY_NAME = 'ArabicFont'; 

try {
    registerFont(ARABIC_FONT_PATH, { family: ARABIC_FONT_FAMILY_NAME });
    console.log(`Font "${ARABIC_FONT_PATH}" registered successfully as "${ARABIC_FONT_FAMILY_NAME}".`);
} catch (e) {
    console.error(`Error registering font "${ARABIC_FONT_PATH}":`, e);
    console.warn('Falling back to system fonts (Arial, sans-serif). Arabic rendering may be incorrect.');
}

const FONT_FAMILY = `${ARABIC_FONT_FAMILY_NAME}, Arial, sans-serif`;

function wrapText(ctx, text, maxWidth) {
    if (!text) return [''];
    const words = text.split(' ');
    if (words.length === 0) return [''];
    const lines = [];
    let currentLine = words[0];
    if (ctx.measureText(currentLine).width > maxWidth) {
        lines.push(currentLine);
        currentLine = ''; 
        if (words.length === 1) return lines; 
    } else if (words.length === 1) {
        return [currentLine]; 
    }
    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const testLine = currentLine ? currentLine + ' ' + word : word;
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth) {
            lines.push(currentLine);
            currentLine = word; 
            if (ctx.measureText(currentLine).width > maxWidth) {
                 lines.push(currentLine); 
                 currentLine = '';
            }
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine !== '') {
        lines.push(currentLine);
    }
    return lines;
}

module.exports = async function createImage(data, outputPath) {
    const width = 1280;
    const height = 720;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const textDarkBlue = '#388090';
    const textLightGrey = '#000000';
    const greenAccent = '#629f60';
    const white = '#f8f8f8';
    const textboxBorderGrey = '#a0a0a0';
    const textboxTextGrey = '#0b5394';

    try {
        const backgroundImage = await loadImage(path.resolve('image.jpg')); 
        ctx.drawImage(backgroundImage, 0, 0, width, height); 
    } catch (error) {
        console.error('Error loading background image:', error);
        ctx.fillStyle = white;
        ctx.fillRect(0, 0, width, height);
    }

    const rightSectionLeftBoundary = width * 0.4;
    const rightMargin = 60; 
    const rightSectionWidth = width - rightSectionLeftBoundary - rightMargin;
    const rightSectionCenterX = rightSectionLeftBoundary + rightSectionWidth / 2;

    ctx.textAlign = 'center';
    let currentY = 90; 

    // --- Dynamic Font Size and Wrapping for Series Title ---
    ctx.fillStyle = textLightGrey;
    ctx.direction = "rtl"; 
    const seriesTitleText = data.seriesTitle || '';
    const seriesWordCount = seriesTitleText.split(' ').filter(word => word.length > 0).length;
    const seriesBaseFontSize = 35, seriesMinFontSize = 20, seriesTriggerWordCount = 4, seriesMaxWordCount = 15;
    let finalSeriesTitleFontSize;
    if (seriesWordCount <= seriesTriggerWordCount) {
        finalSeriesTitleFontSize = seriesBaseFontSize;
    } else {
        const wordsOverTrigger = Math.min(seriesWordCount, seriesMaxWordCount) - seriesTriggerWordCount;
        const wordCountRange = seriesMaxWordCount - seriesTriggerWordCount;
        const fontSizeRange = seriesBaseFontSize - seriesMinFontSize;
        const reduction = (wordsOverTrigger / wordCountRange) * fontSizeRange;
        finalSeriesTitleFontSize = seriesBaseFontSize - reduction;
    }
    const seriesTitleLineHeight = Math.round(finalSeriesTitleFontSize * 1.25);
    ctx.font = `${Math.round(finalSeriesTitleFontSize)}px ${FONT_FAMILY}`;
    const maxSeriesTitleWidth = rightSectionWidth * 0.9;
    const wrappedSeriesTitleLines = wrapText(ctx, seriesTitleText, maxSeriesTitleWidth);
    wrappedSeriesTitleLines.forEach(line => {
        ctx.fillText(line, rightSectionCenterX, currentY);
        currentY += seriesTitleLineHeight;
    });
    const spaceBelowTitleBaseline = 20;
    const lineY = currentY - seriesTitleLineHeight + spaceBelowTitleBaseline; 
    const lineHeightWidth = 300; 

    const lineStartX = rightSectionCenterX - lineHeightWidth / 2;
    const lineEndX = rightSectionCenterX + lineHeightWidth / 2;
    ctx.beginPath();
    ctx.moveTo(lineStartX, lineY);
    ctx.lineTo(lineEndX, lineY);
    ctx.strokeStyle = textLightGrey; 
    ctx.lineWidth = 2;
    ctx.stroke();

    const spaceBelowLineAndBeforeMainTitle = 70; 
    currentY = lineY + spaceBelowLineAndBeforeMainTitle; 

    // --- Main Title Logic (with dynamic font) ---
    ctx.fillStyle = textDarkBlue;
    const mainTitleText = data.mainTitle || '';
    const wordCount = mainTitleText.split(' ').filter(word => word.length > 0).length;
    const baseFontSize = 55, minFontSize = 30, triggerWordCount = 5, maxWordCount = 20;
    let finalMainTitleFontSize;
    if (wordCount <= triggerWordCount) {
        finalMainTitleFontSize = baseFontSize;
    } else {
        const wordsOverTrigger = Math.min(wordCount, maxWordCount) - triggerWordCount;
        const wordCountRange = maxWordCount - triggerWordCount;
        const fontSizeRange = baseFontSize - minFontSize;
        const reduction = (wordsOverTrigger / wordCountRange) * fontSizeRange;
        finalMainTitleFontSize = baseFontSize - reduction;
    }
    ctx.font = `bold ${Math.round(finalMainTitleFontSize)}px ${FONT_FAMILY}`; 
    const mainTitleLineHeight = Math.round(finalMainTitleFontSize * 1.25);
    const wrappedTitleLines = wrapText(ctx, mainTitleText, rightSectionWidth * 0.7);
    wrappedTitleLines.forEach((line) => {
        ctx.fillText(line, rightSectionCenterX, currentY);
        currentY += mainTitleLineHeight;
    });
    
    currentY += 30; 

    // ##################################################################
    // ### MODIFICATION START: Speaker Bubble with Dynamic Font Size ###
    // ##################################################################
    const speakerText = data.speaker || '';
    const speakerWordCount = speakerText.split(' ').filter(word => word.length > 0).length;

    // --- Parameters for font scaling ---
    const speakerBaseFontSize = 45;       // Font size for short speaker names (<= 3 words)
    const speakerMinFontSize = 25;        // The smallest the font can get for long names
    const speakerTriggerWordCount = 3;    // Word count at which font starts shrinking
    const speakerMaxWordCount = 10;       // Word count at which font reaches minimum size

    let finalSpeakerFontSize;
    if (speakerWordCount <= speakerTriggerWordCount) {
        finalSpeakerFontSize = speakerBaseFontSize;
    } else {
        // Calculate how far into the "shrinking range" the current word count is
        const wordsOverTrigger = Math.min(speakerWordCount, speakerMaxWordCount) - speakerTriggerWordCount;
        const wordCountRange = speakerMaxWordCount - speakerTriggerWordCount;
        const fontSizeRange = speakerBaseFontSize - speakerMinFontSize;

        // Calculate the reduction and apply it to the base font size
        const reduction = (wordsOverTrigger / wordCountRange) * fontSizeRange;
        finalSpeakerFontSize = Math.round(speakerBaseFontSize - reduction);
    }
    
    // Set the calculated font size
    ctx.font = `bold ${finalSpeakerFontSize}px ${FONT_FAMILY}`; 

    // Now calculate the bubble dimensions based on the text and new font size
    const speakerTextMetrics = ctx.measureText(speakerText);
    const speakerPaddingH = 30;
    const speakerPaddingV = 15;
    const speakerBubbleWidth = speakerTextMetrics.width + speakerPaddingH * 2;
    const speakerBubbleHeight = finalSpeakerFontSize + speakerPaddingV * 2;
    
    // The top of the bubble starts at the current Y position
    const speakerBubbleY = currentY;
    const speakerBubbleX = rightSectionCenterX - (speakerBubbleWidth / 2);
    
    // The text baseline needs to be calculated to be vertically centered inside the bubble
    const speakerTextY = speakerBubbleY + speakerPaddingV + (finalSpeakerFontSize * 0.8);
    
    const speakerCornerRadius = speakerBubbleHeight / 2;

    // Draw the bubble
    ctx.fillStyle = greenAccent;
    ctx.beginPath();
    ctx.moveTo(speakerBubbleX + speakerCornerRadius, speakerBubbleY);
    ctx.arcTo(speakerBubbleX + speakerBubbleWidth, speakerBubbleY, speakerBubbleX + speakerBubbleWidth, speakerBubbleY + speakerCornerRadius, speakerCornerRadius);
    ctx.arcTo(speakerBubbleX + speakerBubbleWidth, speakerBubbleY + speakerBubbleHeight, speakerBubbleX + speakerBubbleWidth - speakerCornerRadius, speakerBubbleY + speakerBubbleHeight, speakerCornerRadius);
    ctx.arcTo(speakerBubbleX, speakerBubbleY + speakerBubbleHeight, speakerBubbleX, speakerBubbleY + speakerBubbleHeight - speakerCornerRadius, speakerCornerRadius);
    ctx.arcTo(speakerBubbleX, speakerBubbleY, speakerBubbleX + speakerCornerRadius, speakerBubbleY, speakerCornerRadius);
    ctx.closePath();
    ctx.fill();
    
    // Draw the text inside the bubble
    ctx.fillStyle = white;
    ctx.fillText(speakerText, rightSectionCenterX, speakerTextY); 

    // Update currentY to be below the newly drawn bubble
    currentY += speakerBubbleHeight; 
    // ##################################################################
    // ### MODIFICATION END ###
    // ##################################################################

    const spaceAfterBubbleBeforeTextbox = 30; 
    currentY += spaceAfterBubbleBeforeTextbox;

    // --- Extra Text Box Logic ---
    if (data.extraText && data.extraText.trim() !== '') {
        const textboxPadding = 20;
        const textboxCornerRadius = 10;
        const textboxWidth = rightSectionWidth * 0.9; 

        // Dynamic Font Size for Extra Text Box
        const extraText = data.extraText || '';
        const extraTextWordCount = extraText.split(' ').filter(word => word.length > 0).length;
        const textboxBaseFontSize = 28, textboxMinFontSize = 16, textboxTriggerWordCount = 30, textboxMaxWordCount = 80;
        let finalTextboxFontSize;
        if (extraTextWordCount <= textboxTriggerWordCount) {
            finalTextboxFontSize = textboxBaseFontSize;
        } else {
            const wordsOverTrigger = Math.min(extraTextWordCount, textboxMaxWordCount) - textboxTriggerWordCount;
            const wordCountRange = textboxMaxWordCount - textboxTriggerWordCount;
            const fontSizeRange = textboxBaseFontSize - textboxMinFontSize;
            const reduction = (wordsOverTrigger / wordCountRange) * fontSizeRange;
            finalTextboxFontSize = textboxBaseFontSize - reduction;
        }

        const finalFontSizeRounded = Math.round(finalTextboxFontSize);
        const textboxLineHeight = Math.round(finalFontSizeRounded * 1.4); 
        ctx.font = `${finalFontSizeRounded}px ${FONT_FAMILY}`; 

        const wrappedLines = wrapText(ctx, data.extraText, textboxWidth - textboxPadding * 2);
        const textboxTextHeight = wrappedLines.length * textboxLineHeight;
        const textboxHeight = textboxTextHeight + textboxPadding * 2; 

        const textboxStartX = rightSectionCenterX - (textboxWidth / 2);
        const textboxStartY = currentY;

        // Draw the box
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.strokeStyle = textboxBorderGrey;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(textboxStartX + textboxCornerRadius, textboxStartY);
        ctx.arcTo(textboxStartX + textboxWidth, textboxStartY, textboxStartX + textboxWidth, textboxStartY + textboxCornerRadius, textboxCornerRadius);
        ctx.arcTo(textboxStartX + textboxWidth, textboxStartY + textboxHeight, textboxStartX + textboxWidth - textboxCornerRadius, textboxStartY + textboxHeight, textboxCornerRadius);
        ctx.arcTo(textboxStartX, textboxStartY + textboxHeight, textboxStartX, textboxStartY + textboxHeight - textboxCornerRadius, textboxCornerRadius);
        ctx.arcTo(textboxStartX, textboxStartY, textboxStartX + textboxCornerRadius, textboxStartY, textboxCornerRadius);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw the text inside the box
        ctx.fillStyle = textboxTextGrey;
        ctx.textAlign = 'center'; 
        let textCurrentY = textboxStartY + textboxPadding + (textboxLineHeight / 2) + (textboxTextHeight - wrappedLines.length * textboxLineHeight) / 2 + finalFontSizeRounded / 2;
        
        wrappedLines.forEach(line => {
            ctx.fillText(line, textboxStartX + textboxWidth / 2, textCurrentY);
            textCurrentY += textboxLineHeight; 
        });
        currentY += textboxHeight; 
    }
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    console.log(`Image saved to ${outputPath}`);
};