let selectedSearchImage = null;

document.getElementById("search-button").onclick = () => {
  document.getElementById("search-modal").style.display = "block";
};

document.getElementById("close-modal").onclick = () => {
  document.getElementById("search-modal").style.display = "none";
};

document.getElementById("search-go").onclick = async () => {
  const q = document.getElementById("search-input").value.trim();
  if (!q) return;

  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  const data = await res.json();

  const container = document.getElementById("search-results");
  container.innerHTML = "";
  data.results.forEach((img) => {
    const el = document.createElement("img");
    el.src = img.thumb || img.url;
    el.style.width = "120px";
    el.style.cursor = "pointer";
    el.onclick = () => {
      selectedSearchImage = img.url;
      document.getElementById("preview-img").src = img.url;
      document.getElementById("preview-box").style.display = "block";
    };
    container.appendChild(el);
  });
};

document.getElementById("cancel-preview").onclick = () => {
  selectedSearchImage = null;
  document.getElementById("preview-box").style.display = "none";
};

document.getElementById("send-selected").onclick = async () => {
  if (!selectedSearchImage) return;

  // Convert image URL → File
  const resp = await fetch(selectedSearchImage);
  const blob = await resp.blob();
  const file = new File([blob], "search-image.jpg", { type: blob.type });

  // Inject into your chat flow
  selectedFile = [file]; 
  document.getElementById("send-button").click();

  // Cleanup
  selectedSearchImage = null;
  document.getElementById("preview-box").style.display = "none";
  document.getElementById("search-modal").style.display = "none";
};
