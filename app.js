const TOOLS = [
  { id: 'gutter', label: 'Gutter', short: 'G', needsFeet: true, billable: 1, color: '#2563eb' },
  { id: 'downspout', label: 'Downspout', short: 'DS', needsFeet: true, billable: 1, color: '#059669' },
  { id: 'insideMiter', label: 'Inside Miter', short: 'IM', needsFeet: false, billable: 3, color: '#dc2626' },
  { id: 'outsideMiter', label: 'Outside Miter', short: 'OM', needsFeet: false, billable: 3, color: '#ea580c' },
  { id: 'outlet', label: 'Outlet', short: 'O', needsFeet: false, billable: 1, color: '#4b5563' },
  { id: 'endCapPair', label: 'End Cap Pair', short: 'EC', needsFeet: false, billable: 1, color: '#ca8a04' },
  { id: 'aElbow', label: 'A Elbow', short: 'A', needsFeet: false, usesQuantity: true, billable: 1, color: '#7c3aed' },
  { id: 'bElbow', label: 'B Elbow', short: 'B', needsFeet: false, usesQuantity: true, billable: 1, color: '#db2777' },
  { id: 'twoCrimp', label: '2-Crimp', short: '2C', needsFeet: false, usesQuantity: true, billable: 1, color: '#0891b2' },
  { id: 'fourCrimp', label: '4-Crimp', short: '4C', needsFeet: false, usesQuantity: true, billable: 1, color: '#9333ea' },
  { id: 'diverter', label: 'Diverter', short: 'D', needsFeet: false, billable: 0, color: '#92400e' }
];

let state = { id: crypto.randomUUID(), photos: [], selectedTool: 'gutter', currentEntry: null };
const $ = id => document.getElementById(id);
const photoInput = $('photoInput');
const photosEl = $('photos');
$('jobDate').valueAsDate = new Date();

const toolById = id => TOOLS.find(t => t.id === id);
const num = id => Number($(id).value || 0);
const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const trim = n => Number(n.toFixed(2)).toString();
const markerQuantity = marker => Math.max(1, Number(marker.value || 1));

$('addPhotoBtn').onclick = () => photoInput.click();
photoInput.onchange = async e => {
  for (const file of [...e.target.files]) {
    state.photos.push({
      id: crypto.randomUUID(),
      label: `Photo ${state.photos.length + 1}`,
      dataUrl: await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }),
      markers: []
    });
  }
  photoInput.value = '';
  renderPhotos();
  calculate();
};

function markerText(marker, tool) {
  if (tool.needsFeet) return `${tool.short}<span class="mini">${marker.value}'</span>`;
  if (tool.usesQuantity) return `${tool.short}<span class="mini">×${markerQuantity(marker)}</span>`;
  return tool.short;
}

function renderPhotos() {
  photosEl.innerHTML = '';
  if (!state.photos.length) {
    photosEl.innerHTML = '<div class="empty-state"><strong>No photos added yet</strong><span>Tap “Add Photo” to start measuring.</span></div>';
    return;
  }

  const tpl = $('photoCardTemplate');
  state.photos.forEach(photo => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    const img = node.querySelector('.property-photo');
    const layer = node.querySelector('.marker-layer');
    const label = node.querySelector('.photo-label');
    const toolbar = node.querySelector('.toolbar');
    const summary = node.querySelector('.photo-summary');

    label.value = photo.label;
    img.src = photo.dataUrl;
    label.oninput = () => { photo.label = label.value; status(); };

    node.querySelector('.delete-photo').onclick = () => {
      if (confirm('Delete this photo and its markers?')) {
        state.photos = state.photos.filter(p => p.id !== photo.id);
        renderPhotos();
        calculate();
      }
    };

    TOOLS.forEach(tool => {
      const button = document.createElement('button');
      button.className = 'tool' + (state.selectedTool === tool.id ? ' active' : '');
      button.textContent = tool.label;
      button.onclick = () => { state.selectedTool = tool.id; renderPhotos(); };
      toolbar.appendChild(button);
    });

    layer.onclick = e => {
      if (e.target.closest('.marker')) return;
      const rect = layer.getBoundingClientRect();
      beginEntry(photo.id, (e.clientX - rect.left) / rect.width * 100, (e.clientY - rect.top) / rect.height * 100);
    };

    photo.markers.forEach(marker => {
      const tool = toolById(marker.tool);
      const markerButton = document.createElement('button');
      markerButton.className = 'marker';
      markerButton.style.left = marker.x + '%';
      markerButton.style.top = marker.y + '%';
      markerButton.style.background = tool.color;
      markerButton.innerHTML = markerText(marker, tool);
      markerButton.onclick = e => {
        e.stopPropagation();
        beginEntry(photo.id, marker.x, marker.y, marker);
      };
      layer.appendChild(markerButton);
    });

    const counts = {};
    photo.markers.forEach(marker => {
      const tool = toolById(marker.tool);
      counts[marker.tool] = (counts[marker.tool] || 0) + (tool.usesQuantity ? markerQuantity(marker) : 1);
    });
    summary.textContent = TOOLS.filter(t => counts[t.id]).map(t => `${t.label}: ${counts[t.id]}`).join(' • ') || 'No measurements on this photo.';
    photosEl.appendChild(node);
  });
}

function beginEntry(photoId, x, y, existing = null) {
  const tool = existing ? toolById(existing.tool) : toolById(state.selectedTool);
  state.currentEntry = { photoId, x, y, existingId: existing?.id || null, tool: tool.id };
  $('popoverTitle').textContent = (existing ? 'Edit ' : '') + tool.label;

  const showInput = tool.needsFeet || tool.usesQuantity;
  $('measurementLabel').classList.toggle('hidden', !showInput);
  $('measurementText').textContent = tool.usesQuantity ? 'Quantity' : 'Feet';
  $('measurementInput').min = tool.usesQuantity ? '1' : '0';
  $('measurementInput').step = tool.usesQuantity ? '1' : '0.5';
  $('measurementInput').inputMode = tool.usesQuantity ? 'numeric' : 'decimal';
  $('measurementInput').value = existing?.value ?? (tool.usesQuantity ? 1 : '');

  $('entryPopover').classList.remove('hidden');
  if (showInput) setTimeout(() => $('measurementInput').focus(), 50);
}

$('cancelEntry').onclick = () => {
  $('entryPopover').classList.add('hidden');
  state.currentEntry = null;
};

$('saveEntry').onclick = () => {
  const entry = state.currentEntry;
  const photo = state.photos.find(p => p.id === entry.photoId);
  const tool = toolById(entry.tool);
  let value = 1;

  if (tool.needsFeet) value = Number($('measurementInput').value);
  if (tool.usesQuantity) value = Math.floor(Number($('measurementInput').value));
  if (tool.needsFeet && !value) return alert('Enter the footage.');
  if (tool.usesQuantity && value < 1) return alert('Enter a quantity of 1 or more.');

  if (entry.existingId) photo.markers.find(m => m.id === entry.existingId).value = value;
  else photo.markers.push({ id: crypto.randomUUID(), tool: entry.tool, x: entry.x, y: entry.y, value });

  $('entryPopover').classList.add('hidden');
  state.currentEntry = null;
  renderPhotos();
  calculate();
};

['pricePerFoot', 'materials', 'labor', 'delivery', 'otherCosts'].forEach(id => $(id).oninput = calculate);

function aggregate() {
  const totals = Object.fromEntries(TOOLS.map(t => [t.id, { count: 0, feet: 0 }]));
  state.photos.forEach(photo => photo.markers.forEach(marker => {
    const tool = toolById(marker.tool);
    if (tool.needsFeet) totals[marker.tool].feet += Number(marker.value || 0);
    else totals[marker.tool].count += tool.usesQuantity ? markerQuantity(marker) : 1;
  }));
  return totals;
}

function calculate() {
  const totals = aggregate();
  let billable = 0;
  TOOLS.forEach(tool => {
    billable += tool.needsFeet ? totals[tool.id].feet : totals[tool.id].count * tool.billable;
  });

  const customer = billable * num('pricePerFoot');
  const costs = num('materials') + num('labor') + num('delivery') + num('otherCosts');
  $('billableFeet').textContent = trim(billable) + ' ft';
  $('customerPrice').textContent = money(customer);
  $('totalCosts').textContent = money(costs);
  $('grossProfit').textContent = money(customer - costs);
  $('totalsGrid').innerHTML = TOOLS.map(tool => `<div class="total-box"><span>${tool.label}</span><strong>${tool.needsFeet ? trim(totals[tool.id].feet) + ' ft' : totals[tool.id].count}</strong></div>`).join('');
  status();
}

function buildCrewReport() {
  const report = $('crewReport');
  const totals = aggregate();
  const jobName = $('jobName').value.trim() || 'Untitled Job';
  const date = $('jobDate').value ? new Date($('jobDate').value + 'T12:00:00').toLocaleDateString() : '';
  const address = $('address').value.trim();
  const phone = $('phone').value.trim();
  const notes = $('notes').value.trim();

  const totalsHtml = TOOLS
    .filter(tool => tool.needsFeet ? totals[tool.id].feet : totals[tool.id].count)
    .map(tool => `<div class="crew-total"><span>${tool.label}</span><strong>${tool.needsFeet ? trim(totals[tool.id].feet) + ' ft' : totals[tool.id].count}</strong></div>`)
    .join('') || '<p>No materials entered.</p>';

  const photosHtml = state.photos.map(photo => {
    const markers = photo.markers.map(marker => {
      const tool = toolById(marker.tool);
      return `<span class="print-marker" style="left:${marker.x}%;top:${marker.y}%;background:${tool.color}">${tool.needsFeet ? `${tool.short} ${marker.value}'` : tool.usesQuantity ? `${tool.short} ×${markerQuantity(marker)}` : tool.short}</span>`;
    }).join('');
    return `<section class="crew-photo-page"><h2>${escapeHtml(photo.label || 'Photo')}</h2><div class="print-photo-wrap"><img src="${photo.dataUrl}" alt="${escapeHtml(photo.label || 'Job photo')}"><div class="print-marker-layer">${markers}</div></div></section>`;
  }).join('');

  report.innerHTML = `
    <section class="crew-cover">
      <div class="crew-brand"><h1>SNR Contracting</h1><p>Gutter Installation Work Order</p></div>
      <div class="crew-job-grid">
        <div><span>Job</span><strong>${escapeHtml(jobName)}</strong></div>
        <div><span>Date</span><strong>${escapeHtml(date)}</strong></div>
        <div class="wide"><span>Address</span><strong>${escapeHtml(address || '—')}</strong></div>
        <div><span>Phone</span><strong>${escapeHtml(phone || '—')}</strong></div>
      </div>
      <h2>Material & Measurement Totals</h2>
      <div class="crew-totals">${totalsHtml}</div>
      <h2>Crew Notes</h2>
      <div class="crew-notes">${notes ? escapeHtml(notes).replace(/\n/g, '<br>') : 'No additional notes.'}</div>
    </section>
    ${photosHtml}
  `;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

$('crewPdfBtn').onclick = () => {
  buildCrewReport();
  window.print();
};

function status() { $('saveStatus').textContent = 'Unsaved changes'; }
function data() {
  return {
    ...state,
    currentEntry: null,
    job: { name: $('jobName').value, date: $('jobDate').value, address: $('address').value, phone: $('phone').value, notes: $('notes').value },
    pricing: { pricePerFoot: num('pricePerFoot'), materials: num('materials'), labor: num('labor'), delivery: num('delivery'), otherCosts: num('otherCosts') }
  };
}

$('saveJobBtn').onclick = () => {
  const jobs = JSON.parse(localStorage.getItem('snrGutterJobs') || '[]');
  const current = data();
  const index = jobs.findIndex(job => job.id === current.id);
  index >= 0 ? jobs[index] = current : jobs.unshift(current);
  localStorage.setItem('snrGutterJobs', JSON.stringify(jobs));
  $('saveStatus').textContent = 'Saved';
  renderSavedJobs();
};

function renderSavedJobs() {
  const jobs = JSON.parse(localStorage.getItem('snrGutterJobs') || '[]');
  const el = $('savedJobs');
  el.innerHTML = '';
  if (!jobs.length) {
    el.innerHTML = '<div class="muted">No saved jobs yet.</div>';
    return;
  }

  jobs.forEach(job => {
    const row = document.createElement('div');
    row.className = 'saved-job';
    row.innerHTML = `<div><strong>${escapeHtml(job.job?.name || 'Untitled Job')}</strong><small>${escapeHtml(job.job?.address || '')}</small></div><button class="ghost">Open</button>`;
    row.querySelector('button').onclick = () => {
      state = { id: job.id, photos: job.photos || [], selectedTool: 'gutter', currentEntry: null };
      $('jobName').value = job.job?.name || '';
      $('jobDate').value = job.job?.date || '';
      $('address').value = job.job?.address || '';
      $('phone').value = job.job?.phone || '';
      $('notes').value = job.job?.notes || '';
      for (const key of ['pricePerFoot', 'materials', 'labor', 'delivery', 'otherCosts']) $('' + key).value = job.pricing?.[key] ?? (key === 'pricePerFoot' ? 7.5 : 0);
      renderPhotos();
      calculate();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    el.appendChild(row);
  });
}

$('newJobBtn').onclick = () => { if (confirm('Start a new blank job?')) location.reload(); };
renderPhotos();
renderSavedJobs();
calculate();
