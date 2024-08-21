const { ipcRenderer } = require('electron');

document.getElementById('automationForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  
  const formData = {
    option: document.getElementById('option').value,
    adTitle: document.getElementById('adTitle').value,
    wmdInput: document.getElementById('wmdInput').value,
  };
  
  await ipcRenderer.invoke('submit-form', formData);
});


