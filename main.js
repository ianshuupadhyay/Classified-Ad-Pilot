const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const puppeteer = require("puppeteer");
const fs = require('fs');

const imagePath = "C:\\Users\\Anshu\\Desktop\\nvd\\CL.jpg";
const linksFilePath = path.join(__dirname, 'captured_links.txt');

// Base URLs of the classified ad websites
const baseUrls = [
  "https://doclassifieds.com/index.php?view=post&cityid=CITYID&lang=en&catid=3&shortcutregion=",
  "https://letspostfree.com/index.php?view=post&cityid=CITYID&lang=en&catid=3&shortcutregion=",
  "https://adslov.com/index.php?view=post&cityid=CITYID&lang=en&catid=3&shortcutregion=",
  "https://instantadz.com/index.php?view=post&cityid=CITYID&lang=en&catid=3&shortcutregion=",
  "https://freewebads.biz/index.php?view=post&cityid=CITYID&lang=en&catid=3&shortcutregion=",
  "https://postherefree.com/index.php?view=post&cityid=CITYID&lang=en&catid=3&shortcutregion=",
  "https://greatclassified.com/0/index.php?view=post&cityid=CITYID&lang=en&catid=3&shortcutregion=",
  "https://greatclassified.com//index.php?view=post&cityid=CITYID&lang=en&catid=3&shortcutregion=" // Second instance of greatclassified.com
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

// Enhanced function to find and click Post Now button for greatclassified.com
async function findAndClickPostNowButton(page) {
  return await page.evaluate(() => {
    console.log("=== SEARCHING FOR POST NOW BUTTON ===");
    
    // Try multiple approaches to find the Post Now button
    let postButton = null;
    let foundMethod = '';
   
    // 1. Try by button/input text or value
    console.log("Method 1: Searching by button/input text or value...");
    const buttonElements = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], input[type="image"]'));
    console.log(`Found ${buttonElements.length} button elements to check`);
    
    for (let i = 0; i < buttonElements.length; i++) {
      const button = buttonElements[i];
      const buttonText = button.innerText || button.value || '';
      console.log(`Button ${i + 1}: tagName="${button.tagName}", text="${buttonText}", type="${button.type}", id="${button.id}"`);
      
      if (buttonText.toLowerCase().includes('post now')) {
        console.log(`FOUND: Button with "post now" text at index ${i + 1}`);
        postButton = button;
        foundMethod = 'text/value search';
        break;
      }
    }
   
    // 2. Try by image alt text
    if (!postButton) {
      console.log("Method 2: Searching by image alt text...");
      const images = Array.from(document.querySelectorAll('img'));
      console.log(`Found ${images.length} image elements to check`);
      
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        console.log(`Image ${i + 1}: alt="${img.alt || 'N/A'}", src="${img.src}"`);
        
        if (img.alt && img.alt.toLowerCase().includes('post now')) {
          console.log(`FOUND: Image with "post now" alt text at index ${i + 1}`);
          postButton = img;
          foundMethod = 'image alt text';
          break;
        }
      }
    }
   
    // 3. Try by class or ID containing post
    if (!postButton) {
      console.log("Method 3: Searching by class or ID containing 'post'...");
      const postButtons = buttonElements.filter(el =>
        (el.id && el.id.toLowerCase().includes('post')) ||
        (el.className && el.className.toLowerCase().includes('post'))
      );
      console.log(`Found ${postButtons.length} elements with 'post' in ID or class`);
      
      if (postButtons.length > 0) {
        console.log(`FOUND: Element with 'post' in ID/class: id="${postButtons[0].id}", class="${postButtons[0].className}"`);
        postButton = postButtons[0];
        foundMethod = 'ID/class search';
      }
    }
   
    // 4. Last resort - try any submit button
    if (!postButton) {
      console.log("Method 4: Last resort - searching for any submit button...");
      const submitButtons = document.querySelectorAll('input[type="submit"]');
      console.log(`Found ${submitButtons.length} submit buttons`);
      
      if (submitButtons.length > 0) {
        console.log(`FOUND: Using first submit button as fallback`);
        postButton = submitButtons[0];
        foundMethod = 'submit button fallback';
      }
    }

    // Try to click the button if found
    if (postButton) {
      console.log(`=== ATTEMPTING TO CLICK BUTTON (found via: ${foundMethod}) ===`);
      console.log(`Button details: tagName="${postButton.tagName}", id="${postButton.id}", class="${postButton.className}"`);
      
      try {
        // Try different click methods
        if (typeof postButton.click === 'function') {
          console.log("Trying standard click() method...");
          postButton.click();
          console.log("SUCCESS: Standard click() method worked");
          return { success: true, method: 'click()', foundVia: foundMethod };
        } else {
          console.log("Standard click() not available, trying dispatchEvent...");
          // Fallback: create and dispatch a click event
          const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
          });
          postButton.dispatchEvent(clickEvent);
          console.log("SUCCESS: dispatchEvent method worked");
          return { success: true, method: 'dispatchEvent', foundVia: foundMethod };
        }
      } catch (error) {
        console.error("ERROR: Failed to click button:", error.message);
        return { success: false, error: error.message, foundVia: foundMethod };
      }
    } else {
      console.log("=== NO POST NOW BUTTON FOUND ===");
      return { success: false, error: 'Button not found', foundVia: 'none' };
    }
  });
}

// New function to handle GreatClassified.com posting
async function processGreatClassified(page, siteName, formData, attemptNumber = 1) {
  const { option, adTitle, wmdInput } = formData;
  
  console.log(`=== STARTING GREATCLASSIFIED.COM PROCESSING (Attempt #${attemptNumber}) ===`);
  console.log(`Current URL: ${page.url()}`);
  
  try {
    // Find and click the matching option
    const anchorElements = await page.$$("li > a");
    let optionFound = false;

    for (const anchorElement of anchorElements) {
      const innerText = await page.evaluate(el => el.innerText, anchorElement);
      if (innerText === option) {
        console.log(`Found matching element for attempt #${attemptNumber}:`, option);
        await anchorElement.click();
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 });
        optionFound = true;
        break;
      }
    }

    if (!optionFound) {
      throw new Error(`Option "${option}" not found on attempt #${attemptNumber}`);
    }

    await page.bringToFront(); // Bring the tab to the front

    // Fill the form
    await page.type("#adtitle", adTitle);
    await page.type("#wmd-input", wmdInput);
    await page.type("#email", "keatingarthur01@gmail.com");

    await page.click('input[name="showemail"][value="0"]');
    await page.click('input[name="othercontactok"][value="1"]');
    await page.click('input[name="agree"][value="1"]');

    // Upload the image
    const inputUploadHandle = await page.$('input[type="file"][name="pic[1]"]');
    await inputUploadHandle.uploadFile(imagePath);

    console.log(`Step 1 (Attempt #${attemptNumber}): Form filled successfully, waiting 5 seconds before final submission...`);
    
    // Wait for 5 seconds before final submission
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log(`Step 2 (Attempt #${attemptNumber}): 5 second wait completed, now handling image upload and agreement checkbox...`);
    
    // Re-upload the image (sometimes it gets reset)
    console.log(`Step 2a (Attempt #${attemptNumber}): Re-uploading image...`);
    try {
      const inputUploadHandle = await page.$('input[type="file"]');
      if (inputUploadHandle) {
        await inputUploadHandle.uploadFile(imagePath);
        console.log(`Step 2a (Attempt #${attemptNumber}): SUCCESS - Image re-uploaded`);
      } else {
        console.log(`Step 2a (Attempt #${attemptNumber}): WARNING - File input not found, skipping re-upload`);
      }
    } catch (uploadError) {
      console.log(`Step 2a (Attempt #${attemptNumber}): ERROR - Failed to re-upload image:`, uploadError.message);
    }
    
    // Wait a moment for image processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Handle the "I agree to the terms of use" checkbox
    console.log(`Step 2b (Attempt #${attemptNumber}): Checking for 'I agree to terms' checkbox...`);
    try {
      const agreeCheckbox = await page.$('input[type="checkbox"]');
      if (agreeCheckbox) {
        // Check if it's already checked
        const isChecked = await page.evaluate(checkbox => checkbox.checked, agreeCheckbox);
        if (!isChecked) {
          await agreeCheckbox.click();
          console.log(`Step 2b (Attempt #${attemptNumber}): SUCCESS - Terms agreement checkbox clicked`);
        } else {
          console.log(`Step 2b (Attempt #${attemptNumber}): INFO - Terms agreement checkbox already checked`);
        }
      } else {
        console.log(`Step 2b (Attempt #${attemptNumber}): WARNING - Terms agreement checkbox not found`);
      }
    } catch (checkboxError) {
      console.log(`Step 2b (Attempt #${attemptNumber}): ERROR - Failed to handle checkbox:`, checkboxError.message);
    }
    
    // Wait another moment before clicking Post Now
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`Step 3 (Attempt #${attemptNumber}): Now searching for Post Now button...`);
    
    // Use the enhanced function to find and click the Post Now button
    const result = await findAndClickPostNowButton(page);
    
    if (result.success) {
      console.log(`Step 4 (Attempt #${attemptNumber}): SUCCESS - Post Now button clicked using ${result.method} (found via: ${result.foundVia})`);
      console.log(`Step 5 (Attempt #${attemptNumber}): Waiting for page navigation after form submission...`);
      
      // Wait for navigation after form submission
      try {
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 });
        console.log(`Step 6 (Attempt #${attemptNumber}): Navigation completed successfully`);
      } catch (navError) {
        console.log(`Step 6 (Attempt #${attemptNumber}): Navigation timeout - continuing anyway`);
        console.log(`Navigation error: ${navError.message}`);
      }

      console.log(`Step 7 (Attempt #${attemptNumber}): Final URL after submission: ${page.url()}`);
      
      // Check if we're still on the form page (indicating submission failed)
      if (page.url().includes('view=post')) {
        console.log(`WARNING (Attempt #${attemptNumber}): Still on form page - submission may have failed`);
        
        // Try to find any error messages
        const errorMessages = await page.evaluate(() => {
          const errors = [];
          // Look for common error message selectors
          const errorSelectors = ['.error', '.alert', '.warning', '[class*="error"]', '[class*="alert"]'];
          errorSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              if (el.textContent.trim()) {
                errors.push(el.textContent.trim());
              }
            });
          });
          return errors;
        });
        
        if (errorMessages.length > 0) {
          console.log(`Error messages found (Attempt #${attemptNumber}):`, errorMessages);
        }
      }

      // Extract the links
      console.log(`Step 8 (Attempt #${attemptNumber}): Attempting to extract links from the result page...`);
      const links = await extractLinks(page, siteName); // Remove attempt number from site name
      console.log(`Step 9 (Attempt #${attemptNumber}): Link extraction completed`);
      console.log(`Extracted links for ${siteName} (Attempt #${attemptNumber}):`, links);
      
      console.log(`=== GREATCLASSIFIED.COM PROCESSING COMPLETED (Attempt #${attemptNumber}) ===`);
      return { ...links, attemptNumber }; // Add attempt number as separate property
    } else {
      console.log(`Step 4 (Attempt #${attemptNumber}): FAILED - Could not click Post Now button: ${result.error}`);
      console.log("Checking page content for debugging...");
      
      // Debug: Log all buttons found on the page
      const debugInfo = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], input[type="image"]'));
        return buttons.map(btn => ({
          tagName: btn.tagName,
          type: btn.type || 'N/A',
          innerText: btn.innerText || 'N/A',
          value: btn.value || 'N/A',
          id: btn.id || 'N/A',
          className: btn.className || 'N/A'
        }));
      });
      
      console.log("All buttons found on the page:", debugInfo);
      
      console.log(`=== GREATCLASSIFIED.COM PROCESSING FAILED (Attempt #${attemptNumber}) ===`);
      return {
        site: siteName, // Remove attempt number from site name
        editLink: null,
        viewLink: null,
        attemptNumber // Add attempt number as separate property
      };
    }
  } catch (error) {
    console.error(`=== ERROR IN GREATCLASSIFIED.COM PROCESSING (Attempt #${attemptNumber}) ===`);
    console.error(`Error details:`, error);
    console.error(`Current URL when error occurred: ${page.url()}`);
    return {
      site: siteName, // Remove attempt number from site name
      editLink: null,
      viewLink: null,
      attemptNumber // Add attempt number as separate property
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
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    userDataDir: 'C:\\Users\\Anshu\\AppData\\Local\\Google\\Chrome\\User Data\\Profile 2',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ],
    defaultViewport: null
  });

  const capturedLinks = [];
  let greatClassifiedCount = 0;

  for (const url of urls) {
    try {
      const page = await browser.newPage();
      const siteName = new URL(url).hostname;
      
      await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });

      // Special handling for greatclassified.com (appears twice in the array)
      if (url.includes('greatclassified.com')) {
        greatClassifiedCount++;
        console.log(`\n=== PROCESSING GREATCLASSIFIED.COM (${greatClassifiedCount === 1 ? 'FIRST' : 'SECOND'} TIME) ===`);
        
        // Add a delay between the first and second attempt
        if (greatClassifiedCount === 2) {
          console.log("Waiting 10 seconds before second GreatClassified.com attempt...");
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
        
        const links = await processGreatClassified(page, siteName, formData, greatClassifiedCount);
        capturedLinks.push(links);
      } else {
        // Regular processing for other sites
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

            // Submit the form for other sites
            await page.click('button[type="submit"]');

            // Wait for navigation after form submission
            await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 })
              .catch(err => console.log(`Navigation timeout for ${siteName}, continuing anyway`));

            console.log("Form submitted and redirected to:", page.url());

            // Extract the links
            const links = await extractLinks(page, siteName);
            capturedLinks.push(links);
            
            break;
          }
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

  // Filter captured links - only keep working links (skip GreatClassified Attempt #1)
  const filteredLinks = capturedLinks.filter(item => {
    // Skip GreatClassified.com Attempt #1 (which usually fails)
    if (item.site === 'greatclassified.com' && item.attemptNumber === 1) {
      console.log('Filtering out GreatClassified.com Attempt #1 (non-working links)');
      return false;
    }
    // Remove attemptNumber property from the final result
    if (item.attemptNumber) {
      delete item.attemptNumber;
    }
    return true;
  });

  // Save links to file
  if (filteredLinks.length > 0) {
    try {
      // Create a timestamp
      const timestamp = new Date().toLocaleString().replace(/[/\\:]/g, '-');
      
      // Format links for saving
      const linksContent = filteredLinks.map(item => 
        `--- ${item.site} ---\nEdit Link: ${item.editLink || 'Not found'}\nView Link: ${item.viewLink || 'Not found'}\n`
      ).join('\n');
      
      // Save to file with timestamp
      const fileContent = `=== Links captured on ${timestamp} ===\n\n${linksContent}\n\n`;
      
      // Append to file
      fs.appendFileSync(linksFilePath, fileContent);
      console.log(`Links saved to ${linksFilePath}`);
      
      // Send the filtered links back to the renderer process
      mainWindow.webContents.send('links-captured', filteredLinks);
    } catch (error) {
      console.error('Error saving links to file:', error);
    }
  }

  console.log("All tasks completed. Browser will remain open.");
  return filteredLinks; // Return filtered links to the renderer
});
