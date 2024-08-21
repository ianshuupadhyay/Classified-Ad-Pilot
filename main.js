const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const puppeteer = require("puppeteer");

const imagePath = "C:\\Users\\Anshu\\Desktop\\nvd\\CL.jpg";

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'renderer.js'),
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false // Disable background throttling
    },
  });

  mainWindow.loadFile('index.html');
}

app.on('ready', createWindow);

ipcMain.handle('submit-form', async (event, formData) => {
  const { option, adTitle, wmdInput } = formData;
  const urls = [
    "https://totalclassifieds.com/index.php?view=post&cityid=587&lang=en&catid=3&shortcutregion=",
    "https://pclassified.com/index.php?view=post&cityid=587&lang=en&catid=3&shortcutregion=",
    "https://letspostfree.com/index.php?view=post&cityid=587&lang=en&catid=3&shortcutregion=",
    "https://www.adslov.com/index.php?view=post&cityid=587&lang=en&catid=3&shortcutregion=",
    "https://instantadz.com/index.php?view=post&cityid=587&lang=en&catid=3&shortcutregion=",
    "https://classifieds4free.biz/index.php?view=post&cityid=587&lang=en&catid=3&shortcutregion=",
    "https://www.comadz.com/index.php?view=post&cityid=587&lang=en&catid=3&shortcutregion="
  ];

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
  });

  for (const url of urls) {
    try {
      const page = await browser.newPage();
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

          // Submit the form
          await page.click('button[type="submit"]');

          // Wait for navigation after form submission
          await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 6000 });

          console.log("Form submitted and redirected to:", page.url());
          break;
        }
      }
    } catch (error) {
      console.error(`Error processing ${url}:`, error);
    }
  }

  console.log("All tasks completed. Browser will remain open.");
});
