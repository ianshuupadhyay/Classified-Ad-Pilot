const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const puppeteer = require("puppeteer");
const fs = require('fs');

const imagePath = "C:\\Users\\Anshu\\Desktop\\nvd\\CL.jpg";
const linksFilePath = path.join(__dirname, 'captured_links.txt');

// Base URLs of the classified ad websites
const baseUrls = [
  "https://letspostfree.com/index.php?view=post&cityid=CITYID&lang=en&catid=3&shortcutregion=",
  "https://globalclassified.net/index.php?view=post&cityid=CITYID&lang=en&catid=3&shortcutregion=",
  "https://adslov.com/index.php?view=post&cityid=CITYID&lang=en&catid=3&shortcutregion=",
  "https://instantadz.com/index.php?view=post&cityid=CITYID&lang=en&catid=3&shortcutregion=",
  "https://greatclassified.com/0/index.php?view=post&cityid=CITYID&lang=en&catid=3&shortcutregion="
];

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000, // Increased width
    height: 800, // Increased height
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false // Disable background throttling
    },
  });

  mainWindow.loadFile('index.html');
}

app.on('ready', createWindow);

// Improved function to extract links from page
async function extractLinks(page, siteName) {
  try {
    // Try to find edit link and view link
    const links = await page.evaluate(() => {
      const result = { editLink: null, viewLink: null };
      
      // First try to find links directly
      const allLinks = document.querySelectorAll('a');
      for (const link of allLinks) {
        const href = link.getAttribute('href');
        const text = link.textContent.toLowerCase();
        
        if (href) {
          // Look for edit links
          if (href.includes('view=edit') || 
              href.includes('edit') || 
              text.includes('edit') || 
              text.includes('modify')) {
            result.editLink = href;
          }
          
          // Look for view links
          if (href.includes('/posts/') || 
              text.includes('view') || 
              text.includes('posted')) {
            result.viewLink = href;
          }
        }
      }
      
      // If we still don't have links, look for text that might contain URLs
      if (!result.viewLink) {
        const paragraphs = document.querySelectorAll('p');
        for (const p of paragraphs) {
          const text = p.textContent;
          
          // Look for URLs in text
          const urlRegex = /(https?:\/\/[^\s]+)/g;
          const matches = text.match(urlRegex);
          
          if (matches && matches.length > 0) {
            // If we find URLs, use the first one as view link
            result.viewLink = matches[0];
            
            // If we don't have an edit link yet, look for edit-related text
            if (!result.editLink && 
                (text.toLowerCase().includes('edit') || 
                 text.toLowerCase().includes('modify') || 
                 text.toLowerCase().includes('delete'))) {
              // Try to find an edit link in the same paragraph
              const editMatches = text.match(/(https?:\/\/[^\s]+edit[^\s]*)/gi);
              if (editMatches && editMatches.length > 0) {
                result.editLink = editMatches[0];
              }
            }
          }
        }
      }
      
      return result;
    });
    
    console.log(`Extracted links from ${siteName}:`, links);
    return {
      site: siteName,
      editLink: links.editLink || null,
      viewLink: links.viewLink || null
    };
  } catch (error) {
    console.error(`Error extracting links from ${siteName}:`, error);
    return {
      site: siteName,
      editLink: null,
      viewLink: null
    };
  }
}

ipcMain.handle('submit-form', async (event, formData) => {
  const { country, option, adTitle, wmdInput } = formData;
  
  // Generate URLs with the selected country ID
  const urls = baseUrls.map(url => url.replace('CITYID', country));
  
  console.log(`Posting ads for country ID: ${country}`);
  console.log(`Generated URLs:`, urls);

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
  });

  const capturedLinks = [];

  for (const url of urls) {
    try {
      const page = await browser.newPage();
      const siteName = new URL(url).hostname;
      
      await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });

      const anchorElements = await page.$$("li > a");

      for (const anchorElement of anchorElements) {
        const innerText = await page.evaluate(el => el.innerText, anchorElement);
        if (innerText === option) {
          console.log("Found matching element:", option);
          await anchorElement.click();
          await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 });

          await page.bringToFront(); // Bring the tab to the front

          await page.type("#adtitle", adTitle);
          await page.type("#wmd-input", wmdInput);
          await page.type("#email", "keatingarthur01@gmail.com");

          await page.click('input[name="showemail"][value="0"]');
          await page.click('input[name="othercontactok"][value="1"]');
          await page.click('input[name="agree"][value="1"]');

          // Upload the image
          const inputUploadHandle = await page.$('input[type="file"][name="pic[1]"]');
          await inputUploadHandle.uploadFile(imagePath);

          // Special handling for greatclassified.com
          if (url.includes('greatclassified.com')) {
            console.log("Processing greatclassified.com - waiting for manual submission");
            
            // For greatclassified.com, don't submit automatically and don't extract links
            // Just fill the form and wait
            continue;
          } else {
            // Submit the form for other sites
            await page.click('button[type="submit"]');

            // Wait for navigation after form submission
            await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 })
              .catch(err => console.log(`Navigation timeout for ${siteName}, continuing anyway`));

            console.log("Form submitted and redirected to:", page.url());

            // Extract the links
            const links = await extractLinks(page, siteName);
            capturedLinks.push(links);
          }
          
          break;
        }
      }
    } catch (error) {
      console.error(`Error processing ${url}:`, error);
      // Add the site with null links on error
      capturedLinks.push({
        site: new URL(url).hostname,
        editLink: null,
        viewLink: null
      });
    }
  }

  // Save links to file
  if (capturedLinks.length > 0) {
    try {
      // Create a timestamp
      const timestamp = new Date().toLocaleString().replace(/[/\\:]/g, '-');
      
      // Format links for saving
      const linksContent = capturedLinks.map(item => 
        `--- ${item.site} ---\nEdit Link: ${item.editLink || 'Not found'}\nView Link: ${item.viewLink || 'Not found'}\n`
      ).join('\n');
      
      // Save to file with timestamp
      const fileContent = `=== Links captured on ${timestamp} ===\n\n${linksContent}\n\n`;
      
      // Append to file
      fs.appendFileSync(linksFilePath, fileContent);
      console.log(`Links saved to ${linksFilePath}`);
      
      // Send the links back to the renderer process
      mainWindow.webContents.send('links-captured', capturedLinks);
    } catch (error) {
      console.error('Error saving links to file:', error);
    }
  }

  console.log("All tasks completed. Browser will remain open.");
  return capturedLinks; // Return links to the renderer
});
