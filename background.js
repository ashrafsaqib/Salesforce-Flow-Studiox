chrome.action.onClicked.addListener(async (tab) => {
  await chrome.windows.create({
    url: chrome.runtime.getURL(`chat.html?tabId=${tab.id}`),
    type: 'popup', width: 560, height: 720
  });
});
