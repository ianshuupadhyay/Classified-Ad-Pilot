const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
  const automationForm = document.getElementById('automationForm');
  const linksContainer = document.getElementById('linksContainer');
  const linksTableBody = document.getElementById('linksTableBody');
  const copyAllLinksBtn = document.getElementById('copyAllLinks');
  const loadingIndicator = document.getElementById('loading');
  
  // Handle form submission
  automationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    // Show loading indicator
    loadingIndicator.style.display = 'block';
    
    // Hide links container if it was visible from previous submission
    linksContainer.style.display = 'none';
    
    // Clear previous links
    linksTableBody.innerHTML = '';
    
    const formData = {
      country: document.getElementById('country').value,
      option: document.getElementById('option').value,
      adTitle: document.getElementById('adTitle').value,
      wmdInput: document.getElementById('wmdInput').value,
    };
    
    // Submit the form and wait for links to be captured
    const capturedLinks = await ipcRenderer.invoke('submit-form', formData);
    
    // Hide loading indicator
    loadingIndicator.style.display = 'none';
    
    // If links were captured, display them
    if (capturedLinks && capturedLinks.length > 0) {
      displayLinks(capturedLinks);
    }
  });
  
  // Listen for links captured event from main process
  ipcRenderer.on('links-captured', (event, capturedLinks) => {
    // Hide loading indicator
    loadingIndicator.style.display = 'none';
    
    // Display the links
    if (capturedLinks && capturedLinks.length > 0) {
      displayLinks(capturedLinks);
    }
  });
  
  // Function to display links in the table
  function displayLinks(links) {
    // Clear previous links
    linksTableBody.innerHTML = '';
    
    // Add each link to the table
    links.forEach(item => {
      const row = document.createElement('tr');
      
      // Website column
      const siteCell = document.createElement('td');
      siteCell.textContent = item.site;
      row.appendChild(siteCell);
      
      // Edit link column
      const editLinkCell = document.createElement('td');
      if (item.editLink) {
        const editLink = document.createElement('a');
        editLink.href = '#';
        editLink.textContent = 'Copy Edit Link';
        editLink.dataset.link = item.editLink; // Store link in data attribute
        editLink.addEventListener('click', (e) => {
          e.preventDefault();
          copyToClipboard(item.editLink);
          editLink.textContent = 'Copied!';
          setTimeout(() => {
            editLink.textContent = 'Copy Edit Link';
          }, 1500);
        });
        editLinkCell.appendChild(editLink);
      } else {
        editLinkCell.textContent = 'Not found';
      }
      row.appendChild(editLinkCell);
      
      // View link column
      const viewLinkCell = document.createElement('td');
      if (item.viewLink) {
        const viewLink = document.createElement('a');
        viewLink.href = '#';
        viewLink.textContent = 'Copy View Link';
        viewLink.dataset.link = item.viewLink; // Store link in data attribute
        viewLink.addEventListener('click', (e) => {
          e.preventDefault();
          copyToClipboard(item.viewLink);
          viewLink.textContent = 'Copied!';
          setTimeout(() => {
            viewLink.textContent = 'Copy View Link';
          }, 1500);
        });
        viewLinkCell.appendChild(viewLink);
      } else {
        viewLinkCell.textContent = 'Not found';
      }
      row.appendChild(viewLinkCell);
      
      linksTableBody.appendChild(row);
    });
    
    // Show the links container
    linksContainer.style.display = 'block';
  }
  
  // Handle "Copy All Links" button click
  copyAllLinksBtn.addEventListener('click', () => {
    // Build a string in spreadsheet-compatible tab-delimited format
    const rows = linksTableBody.querySelectorAll('tr');
    
    // Create table rows with tabs between columns (will paste nicely into spreadsheets)
    // No header row, just data rows
    let tableContent = "";
    
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      const site = cells[0].textContent;
      
      // Get view link for "Approval" column
      let viewLink = 'Not found';
      const viewLinkElem = cells[2].querySelector('a');
      if (viewLinkElem) {
        viewLink = viewLinkElem.dataset.link || 'Not found';
      }
      
      // Get edit link
      let editLink = 'Not found';
      const editLinkElem = cells[1].querySelector('a');
      if (editLinkElem) {
        editLink = editLinkElem.dataset.link || 'Not found';
      }
      
      // Add base URL for site column (to match reference image)
      const baseUrl = site.startsWith('www.') ? `https://${site}/` : `https://${site}/`;
      
      // Add row with tab-separated values
      tableContent += `${baseUrl}\t${viewLink}\t${editLink}\n`;
    });
    
    copyToClipboard(tableContent);
    copyAllLinksBtn.textContent = 'All Links Copied!';
    setTimeout(() => {
      copyAllLinksBtn.textContent = 'Copy All Links';
    }, 1500);
  });
  
  // Function to copy text to clipboard
  function copyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
});
