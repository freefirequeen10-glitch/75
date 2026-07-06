// tournaments.js
import { db, storage } from "./firebase.js";
import { 
  doc, 
  getDoc, 
  addDoc, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  collection, 
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Global loop reference to clean up preview changes
let currentEditingJoinedCount = 0; // Remembers joined count for editing match slot percentages

// Global function to show correct Winner Distribution divs cleanly without overwriting values
window.showWinnerDistributionDiv = function(mode) {
  const soloDist = document.getElementById('winner-dist-solo');
  const duoDist = document.getElementById('winner-dist-duo');
  const squadDist = document.getElementById('winner-dist-squad');

  if (soloDist) soloDist.classList.add('hidden');
  if (duoDist) duoDist.classList.add('hidden');
  if (squadDist) squadDist.classList.add('hidden');

  const cleanMode = (mode || 'Solo').toLowerCase();

  if (cleanMode === 'solo') {
    if (soloDist) soloDist.classList.remove('hidden');
  } else if (cleanMode === 'duo') {
    if (duoDist) duoDist.classList.remove('hidden');
  } else if (cleanMode === 'squad') {
    if (squadDist) squadDist.classList.remove('hidden');
  }
};

// Display toggle control for deployment form
window.toggleTournamentForm = function(open) {
  const container = document.getElementById('tourn-form-container');
  if (!container) return;

  if (open) {
    container.classList.remove('hidden');
    container.scrollIntoView({ behavior: 'smooth' });
    
    const modeEl = document.getElementById('tourn-mode');
    const mode = modeEl ? modeEl.value : "Solo";

    // Only auto-calculate prize distribution if we are CREATING (not editing)
    const isEditing = !!document.getElementById('tourn-id')?.value;
    if (!isEditing) {
      window.updateWinnerPrizeDistribution();
    } else {
      // If editing, only show correct div to preserve restored Firestore split values
      window.showWinnerDistributionDiv(mode);
    }
  } else {
    container.classList.add('hidden');
    const form = document.getElementById('tournament-crud-form');
    if (form) form.reset();
    document.getElementById('tourn-id').value = '';
    document.getElementById('tourn-form-title').innerText = "Deploy New Tournament";
    currentEditingJoinedCount = 0;
    
    // Reset local preview banner element
    const prevImg = document.getElementById('prev-card-banner');
    const prevPlaceholder = document.getElementById('prev-card-banner-placeholder');
    if (prevImg) {
      prevImg.src = '';
      prevImg.classList.add('hidden');
    }
    if (prevPlaceholder) prevPlaceholder.classList.remove('hidden');

    window.updateWinnerPrizeDistribution();
    window.updateLiveMatchCardPreview();
  }
};

// Auto-defaults allocation for winner prize distribution (Always perfectly equal decimal splits up to 2 decimal places)
window.updateWinnerPrizeDistribution = function() {
  const modeEl = document.getElementById('tourn-mode');
  if (!modeEl) return;
  const mode = modeEl.value;
  const prize = Number(document.getElementById('tourn-winner-prize')?.value || 0);

  // Show correct div first
  window.showWinnerDistributionDiv(mode);

  const cleanMode = (mode || 'Solo').toLowerCase();

  if (cleanMode === 'solo') {
    const input = document.getElementById('tourn-solo-1st');
    if (input) {
      input.value = prize.toFixed(2); // Winner Prize
    }
  } else if (cleanMode === 'duo') {
    const input1 = document.getElementById('tourn-duo-1st');
    const input2 = document.getElementById('tourn-duo-2nd');
    const p = prize / 2;
    if (input1) input1.value = p.toFixed(2);
    if (input2) input2.value = p.toFixed(2);
  } else if (cleanMode === 'squad') {
    const input1 = document.getElementById('tourn-squad-1st');
    const input2 = document.getElementById('tourn-squad-2nd');
    const input3 = document.getElementById('tourn-squad-3rd');
    const input4 = document.getElementById('tourn-squad-4th');
    
    const p = prize / 4;
    if (input1) input1.value = p.toFixed(2);
    if (input2) input2.value = p.toFixed(2);
    if (input3) input3.value = p.toFixed(2);
    if (input4) input4.value = p.toFixed(2);
  }
  
  window.updateLiveMatchCardPreview();
};

// Auto splits calculation handler logic
const handleWinnerPrizeInput = () => {
  const modeEl = document.getElementById('tourn-mode');
  if (!modeEl) return;
  const mode = modeEl.value;
  const prize = Number(document.getElementById('tourn-winner-prize').value || 0);
  
  const cleanMode = (mode || 'Solo').toLowerCase();

  if (cleanMode === 'solo') {
    const input = document.getElementById('tourn-solo-1st');
    if (input) input.value = prize.toFixed(2);
  } else if (cleanMode === 'duo') {
    const input1 = document.getElementById('tourn-duo-1st');
    const input2 = document.getElementById('tourn-duo-2nd');
    const p = prize / 2;
    if (input1) input1.value = p.toFixed(2);
    if (input2) input2.value = p.toFixed(2);
  } else if (cleanMode === 'squad') {
    const input1 = document.getElementById('tourn-squad-1st');
    const input2 = document.getElementById('tourn-squad-2nd');
    const input3 = document.getElementById('tourn-squad-3rd');
    const input4 = document.getElementById('tourn-squad-4th');
    const p = prize / 4;
    if (input1) input1.value = p.toFixed(2);
    if (input2) input2.value = p.toFixed(2);
    if (input3) input3.value = p.toFixed(2);
    if (input4) input4.value = p.toFixed(2);
  }
  window.updateLiveMatchCardPreview();
};

// Instant FileReader preview for file selector changes
window.handlePreviewFileInput = function(input) {
  const file = input.files[0];
  const prevImg = document.getElementById('prev-card-banner');
  const prevPlaceholder = document.getElementById('prev-card-banner-placeholder');

  if (file && prevImg && prevPlaceholder) {
    const reader = new FileReader();
    reader.onload = function(e) {
      prevImg.src = e.target.result;
      prevImg.classList.remove('hidden');
      prevPlaceholder.classList.add('hidden');
    };
    reader.readAsDataURL(file);
  }
};

// Realtime dynamic layout renderer for preview panel (Section 8)
window.updateLiveMatchCardPreview = function() {
  const title = document.getElementById('tourn-title')?.value || 'Tournament Name';
  const game = document.getElementById('tourn-game')?.value || 'BGMI';
  const matchName = document.getElementById('tourn-match-name')?.value || 'Match 1';
  const mode = document.getElementById('tourn-mode')?.value || 'Solo';
  const map = document.getElementById('tourn-map')?.value || 'Erangel';
  const totalSlots = Math.max(1, Number(document.getElementById('tourn-total-slots')?.value || 100));
  const entryFee = Number(document.getElementById('tourn-entry-fee')?.value || 0);
  const prizePool = Number(document.getElementById('tourn-prize-pool')?.value || 0);
  const perKill = Number(document.getElementById('tourn-per-kill')?.value || 0);
  const winnerPrize = Number(document.getElementById('tourn-winner-prize')?.value || 0);
  const dateVal = document.getElementById('tourn-date')?.value;
  const timeVal = document.getElementById('tourn-time')?.value;
  const bannerUrl = document.getElementById('tourn-image')?.value;
  const status = document.getElementById('tourn-status')?.value || 'upcoming';

  // Render standard text mappings
  const titleEl = document.getElementById('prev-card-title');
  if (titleEl) titleEl.innerText = title;

  const gameEl = document.getElementById('prev-card-game');
  if (gameEl) gameEl.innerText = game;

  const matchNameEl = document.getElementById('prev-card-match-name');
  if (matchNameEl) matchNameEl.innerText = matchName;

  const mapEl = document.getElementById('prev-card-map');
  if (mapEl) mapEl.innerText = map;

  const entryEl = document.getElementById('prev-card-entry');
  if (entryEl) entryEl.innerText = `₹${entryFee}`;

  const poolEl = document.getElementById('prev-card-pool');
  if (poolEl) poolEl.innerText = `₹${prizePool}`;

  const killEl = document.getElementById('prev-card-kill');
  if (killEl) killEl.innerText = `₹${perKill}`;

  const winnerPrizeEl = document.getElementById('prev-card-winner-prize');
  if (winnerPrizeEl) winnerPrizeEl.innerText = `₹${winnerPrize}`;

  // Render banner preview
  const prevImg = document.getElementById('prev-card-banner');
  const prevPlaceholder = document.getElementById('prev-card-banner-placeholder');
  
  const hasLocalUpload = document.getElementById('tourn-image-file')?.files[0];
  if (bannerUrl && !hasLocalUpload) {
    if (prevImg) {
      prevImg.src = bannerUrl;
      prevImg.classList.remove('hidden');
    }
    if (prevPlaceholder) prevPlaceholder.classList.add('hidden');
  }

  // Render Mode indicator badge icon
  const modeTag = document.getElementById('prev-card-mode-tag');
  if (modeTag) {
    const icon = mode.toLowerCase() === 'solo' ? '👤' : mode.toLowerCase() === 'duo' ? '👥' : '👨‍👩‍👦';
    modeTag.innerText = `${icon} ${mode.toUpperCase()}`;
    modeTag.className = `card-mode-tag ${mode.toLowerCase()}`;
  }

  // Section 5 Live slots calculation
  const joinedCount = currentEditingJoinedCount;
  const slotsLeft = Math.max(0, totalSlots - joinedCount);
  const occupancyPct = Math.min(100, Math.round((joinedCount / totalSlots) * 100));
  
  // Slots Status mapping
  let slotStatusLabel = 'Available';
  let slotStatusClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  let slotBarColor = '#10b981';

  if (joinedCount >= totalSlots) {
    slotStatusLabel = 'Full';
    slotStatusClass = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
    slotBarColor = '#f43f5e';
  } else if (occupancyPct >= 80) {
    slotStatusLabel = 'Almost Full';
    slotStatusClass = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
    slotBarColor = '#f59e0b';
  } else if (occupancyPct >= 50) {
    slotStatusLabel = 'Filling Fast';
    slotStatusClass = 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
    slotBarColor = '#b026ff';
  }

  const slotsProgress = document.getElementById('prev-card-slots-progress');
  if (slotsProgress) {
    slotsProgress.style.width = `${occupancyPct}%`;
    slotsProgress.style.backgroundColor = slotBarColor;
  }

  const slotsLabel = document.getElementById('prev-card-slots-label');
  if (slotsLabel) slotsLabel.innerText = `Slots: ${joinedCount}/${totalSlots}`;

  const slotsStatus = document.getElementById('prev-card-slots-status');
  if (slotsStatus) {
    slotsStatus.innerText = slotStatusLabel;
    slotsStatus.className = `px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${slotStatusClass}`;
  }

  const slotsRemaining = document.getElementById('prev-card-slots-remaining');
  if (slotsRemaining) slotsRemaining.innerText = `${slotsLeft} Left`;

  // Render match status badge preview matching user panel mappings (Red, Yellow, Blue, Silver)
  const statusBadge = document.getElementById('prev-card-status-badge');
  if (statusBadge) {
    statusBadge.innerText = status;
    statusBadge.className = `card-status-badge status-${status === 'upcoming' ? 'active' : status}`;
  }

  // Automatic Starts At generator and Countdown Synchronizer binding
  const startsAtDisplay = document.getElementById('prev-card-starts-at-display');
  const previewContainer = document.getElementById('prev-card-countdown-wrapper') || document.getElementById('prev-card-countdown-container');

  if (dateVal && timeVal) {
    const startsAtMillis = new Date(`${dateVal}T${timeVal}`).getTime();
    if (startsAtDisplay) {
      startsAtDisplay.innerText = `${dateVal} | ${timeVal}`;
    }
    if (previewContainer) {
      previewContainer.setAttribute('data-starts-at', isNaN(startsAtMillis) ? '0' : startsAtMillis);
    }
  } else {
    if (startsAtDisplay) startsAtDisplay.innerText = 'TBD';
    if (previewContainer) previewContainer.setAttribute('data-starts-at', '0');
  }
};

// Form submit event logical execution handler
const handleFormSubmit = async (e) => {
  e.preventDefault();
  const btn = document.getElementById('tourn-save-btn');
  if (!btn || btn.disabled) return;
  const originalHtml = btn.innerHTML;

  // Read standard form bindings
  const title = document.getElementById('tourn-title').value.trim();
  const matchName = document.getElementById('tourn-match-name').value.trim();
  const game = document.getElementById('tourn-game').value.trim();
  const mode = document.getElementById('tourn-mode').value;
  const map = document.getElementById('tourn-map').value.trim();
  const entryFee = Number(document.getElementById('tourn-entry-fee').value);
  const prizePool = Number(document.getElementById('tourn-prize-pool').value);
  const perKill = Number(document.getElementById('tourn-per-kill').value || 0);
  const winnerPrize = Number(document.getElementById('tourn-winner-prize').value || 0);
  const totalSlots = Number(document.getElementById('tourn-total-slots').value || 100);
  const date = document.getElementById('tourn-date').value;
  const time = document.getElementById('tourn-time').value;
  const status = document.getElementById('tourn-status').value;
  const description = document.getElementById('tourn-desc').value;

  // Strict Player-based decimal calculations up to 2 decimal places
  let solo1st = winnerPrize;
  let duo1st = 0;
  let duo2nd = 0;
  let squad1st = 0;
  let squad2nd = 0;
  let squad3rd = 0;
  let squad4th = 0;

  const cleanMode = (mode || 'Solo').toLowerCase();

  if (cleanMode === 'solo') {
    solo1st = Number(winnerPrize.toFixed(2));
  } else if (cleanMode === 'duo') {
    const splitVal = Number((winnerPrize / 2).toFixed(2));
    duo1st = splitVal;
    duo2nd = splitVal;
  } else if (cleanMode === 'squad') {
    const splitVal = Number((winnerPrize / 4).toFixed(2));
    squad1st = splitVal;
    squad2nd = splitVal;
    squad3rd = splitVal;
    squad4th = splitVal;
  }

  // Validation Checks
  if (!title || !matchName || !game || !map || !date || !time) {
    window.showToast("Please fill out all required parameters.", "warning");
    return;
  }

  if (entryFee < 0 || prizePool < 0 || perKill < 0 || winnerPrize < 0 || totalSlots <= 0) {
    window.showToast("Numerical metrics must be greater than or equal to 0.", "error");
    return;
  }

  // startsAt Firestore Timestamp calculation
  const startsAtMillis = new Date(`${date}T${time}`).getTime();
  if (isNaN(startsAtMillis)) {
    window.showToast("Invalid date or time selected.", "error");
    return;
  }
  const startsAt = Timestamp.fromDate(new Date(startsAtMillis));

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Saving...`;

  try {
    const tId = document.getElementById('tourn-id').value;
    const file = document.getElementById('tourn-image-file').files[0];
    let imgUrl = document.getElementById('tourn-image').value.trim();

    // Handle Storage asset uploading safely
    if (file) {
      const storageRef = ref(storage, `tournament_banners/${Date.now()}_${file.name}`);
      const snap = await uploadBytes(storageRef, file);
      imgUrl = await getDownloadURL(snap.ref);
    }

    // Payload construction (Strictly equal player decimal distributions saved to Firestore as correct Float parameters)
    const payload = {
      title,
      matchName,
      game,
      mode, // "Solo", "Duo", "Squad"
      matchType: cleanMode, // "solo", "duo", "squad" - used for automatic routing/categorization in Match Manager
      map,
      entryFee,
      prizePool,
      perKill,
      winnerPrize,
      totalSlots,
      startsAt,
      date,
      time,
      status,
      description,
      banner: imgUrl,
      solo1st,
      duo1st,
      duo2nd,
      squad1st,
      squad2nd,
      squad3rd,
      squad4th,
      winnerDistribution: {
        solo1st,
        duo1st,
        duo2nd,
        squad1st,
        squad2nd,
        squad3rd,
        squad4th
      },
      roomId: document.getElementById('tourn-room-id').value,
      roomPass: document.getElementById('tourn-room-pass').value,
      roomIdPublished: document.getElementById('tourn-room-id-published').checked,
      roomPasswordPublished: document.getElementById('tourn-room-pass-published').checked,
      updatedAt: serverTimestamp()
    };

    if (tId) {
      await updateDoc(doc(db, "tournaments", tId), payload);
      window.showToast("Tournament updated successfully.", "success");
    } else {
      payload.createdAt = serverTimestamp();
      payload.joinedCount = 0;
      await addDoc(collection(db, "tournaments"), payload);
      window.showToast("Tournament deployed successfully.", "success");
    }
    
    window.toggleTournamentForm(false);
  } catch (error) {
    window.showToast("Deployment mutation failed: " + error.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
};

// Load values into modification form (Restores strictly calculated decimal distribution to DOM fields formatted to 2 decimal places)
window.editTournament = async function(id) {
  try {
    const docSnap = await getDoc(doc(db, "tournaments", id));
    if (docSnap.exists()) {
      const t = docSnap.data();
      
      currentEditingJoinedCount = Number(t.joinedCount || 0);

      const idEl = document.getElementById('tourn-id');
      if (idEl) idEl.value = id;
      
      const titleEl = document.getElementById('tourn-title');
      if (titleEl) titleEl.value = t.title || "";
      
      const matchNameEl = document.getElementById('tourn-match-name');
      if (matchNameEl) matchNameEl.value = t.matchName || "Match 1";
      
      const gameEl = document.getElementById('tourn-game');
      if (gameEl) gameEl.value = t.game || "";
      
      const modeEl = document.getElementById('tourn-mode');
      if (modeEl) {
        const rawMode = t.mode || t.matchType || "Solo";
        const formattedMode = rawMode.charAt(0).toUpperCase() + rawMode.slice(1).toLowerCase();
        modeEl.value = formattedMode;
      }
      
      const mapEl = document.getElementById('tourn-map');
      if (mapEl) mapEl.value = t.map || "";
      
      const totalSlotsEl = document.getElementById('tourn-total-slots');
      if (totalSlotsEl) totalSlotsEl.value = t.totalSlots || 100;
      
      const entryFeeEl = document.getElementById('tourn-entry-fee');
      if (entryFeeEl) entryFeeEl.value = t.entryFee || 0;
      
      const prizePoolEl = document.getElementById('tourn-prize-pool');
      if (prizePoolEl) prizePoolEl.value = t.prizePool || 0;
      
      const perKillEl = document.getElementById('tourn-per-kill');
      if (perKillEl) perKillEl.value = t.perKill || 0;
      
      const winnerPrizeEl = document.getElementById('tourn-winner-prize');
      if (winnerPrizeEl) winnerPrizeEl.value = t.winnerPrize || 0;
      
      const dateEl = document.getElementById('tourn-date');
      if (dateEl) dateEl.value = t.date || "";
      
      const timeEl = document.getElementById('tourn-time');
      if (timeEl) timeEl.value = t.time || "";
      
      const statusEl = document.getElementById('tourn-status');
      if (statusEl) statusEl.value = t.status || "upcoming";
      
      const imageEl = document.getElementById('tourn-image');
      if (imageEl) imageEl.value = t.banner || "";
      
      const descEl = document.getElementById('tourn-desc');
      if (descEl) descEl.value = t.description || "";
      
      const roomIdEl = document.getElementById('tourn-room-id');
      if (roomIdEl) roomIdEl.value = t.roomId || "";
      
      const roomPassEl = document.getElementById('tourn-room-pass');
      if (roomPassEl) roomPassEl.value = t.roomPass || "";
      
      const roomIdPubEl = document.getElementById('tourn-room-id-published');
      if (roomIdPubEl) roomIdPubEl.checked = t.roomIdPublished || false;
      
      const roomPassPubEl = document.getElementById('tourn-room-pass-published');
      if (roomPassPubEl) roomPassPubEl.checked = t.roomPasswordPublished || false;

      // Restore decimal splits cleanly
      const solo1stEl = document.getElementById('tourn-solo-1st');
      if (solo1stEl) solo1stEl.value = Number(t.winnerDistribution?.solo1st ?? t.solo1st ?? 0).toFixed(2);
      
      const duo1stEl = document.getElementById('tourn-duo-1st');
      if (duo1stEl) duo1stEl.value = Number(t.winnerDistribution?.duo1st ?? t.duo1st ?? 0).toFixed(2);
      
      const duo2ndEl = document.getElementById('tourn-duo-2nd');
      if (duo2ndEl) duo2ndEl.value = Number(t.winnerDistribution?.duo2nd ?? t.duo2nd ?? 0).toFixed(2);
      
      const squad1stEl = document.getElementById('tourn-squad-1st');
      if (squad1stEl) squad1stEl.value = Number(t.winnerDistribution?.squad1st ?? t.squad1st ?? 0).toFixed(2);
      
      const squad2ndEl = document.getElementById('tourn-squad-2nd');
      if (squad2ndEl) squad2ndEl.value = Number(t.winnerDistribution?.squad2nd ?? t.squad2nd ?? 0).toFixed(2);
      
      const squad3rdEl = document.getElementById('tourn-squad-3rd');
      if (squad3rdEl) squad3rdEl.value = Number(t.winnerDistribution?.squad3rd ?? t.squad3rd ?? 0).toFixed(2);

      const squad4thEl = document.getElementById('tourn-squad-4th');
      if (squad4thEl) squad4thEl.value = Number(t.winnerDistribution?.squad4th ?? t.squad4th ?? 0).toFixed(2);

      const titleHeaderEl = document.getElementById('tourn-form-title');
      if (titleHeaderEl) titleHeaderEl.innerText = "Edit Arena: " + (t.title || "Match");
      
      window.toggleTournamentForm(true);
    }
  } catch (e) { 
    window.showToast("Failed to retrieve tournament metadata.", "error"); 
  }
};

// Transition tournament status to active (upcoming)
window.publishTournament = async function(id) {
  if (confirm("Publish this tournament? Status will change to Active and will be visible to users.")) {
    try {
      await updateDoc(doc(db, "tournaments", id), { status: "active" });
      window.showToast("Tournament Published!", "success");
    } catch(e) {
      window.showToast("Failed to publish: " + e.message, "error");
    }
  }
};

// Deconstruct and remove tournament document
window.deleteTournament = async function(id) {
  if (window.currentAdminRole !== "super_admin") {
    window.showToast("Denied! Super Admins only.", "warning");
    return;
  }
  
  if (confirm("Confirm DELETION of arena? This cannot be undone.")) {
    try {
      await deleteDoc(doc(db, "tournaments", id));
      window.showToast("Arena deleted.", "success");
    } catch (error) {
      window.showToast("Deletion failed: " + error.message, "error");
    }
  }
};

// Central dynamic loader to verify DOM elements and safely attach event listeners across execution contexts
function initTournaments() {
  const crudForm = document.getElementById('tournament-crud-form');
  if (crudForm) {
    crudForm.removeEventListener('submit', handleFormSubmit);
    crudForm.addEventListener('submit', handleFormSubmit);
  }

  // Register event listeners directly on input/change events to update the Live Preview card instantly
  const dateInput = document.getElementById('tourn-date');
  if (dateInput) dateInput.addEventListener('input', window.updateLiveMatchCardPreview);

  const timeInput = document.getElementById('tourn-time');
  if (timeInput) timeInput.addEventListener('input', window.updateLiveMatchCardPreview);

  const titleInput = document.getElementById('tourn-title');
  if (titleInput) titleInput.addEventListener('input', window.updateLiveMatchCardPreview);

  const matchNameInput = document.getElementById('tourn-match-name');
  if (matchNameInput) matchNameInput.addEventListener('input', window.updateLiveMatchCardPreview);

  const gameInput = document.getElementById('tourn-game');
  if (gameInput) gameInput.addEventListener('input', window.updateLiveMatchCardPreview);

  const mapInput = document.getElementById('tourn-map');
  if (mapInput) mapInput.addEventListener('input', window.updateLiveMatchCardPreview);

  const totalSlotsInput = document.getElementById('tourn-total-slots');
  if (totalSlotsInput) totalSlotsInput.addEventListener('input', window.updateLiveMatchCardPreview);

  const entryFeeInput = document.getElementById('tourn-entry-fee');
  if (entryFeeInput) entryFeeInput.addEventListener('input', window.updateLiveMatchCardPreview);

  const prizePoolInput = document.getElementById('tourn-prize-pool');
  if (prizePoolInput) prizePoolInput.addEventListener('input', window.updateLiveMatchCardPreview);

  const perKillInput = document.getElementById('tourn-per-kill');
  if (perKillInput) perKillInput.addEventListener('input', window.updateLiveMatchCardPreview);

  const winnerPrizeInput = document.getElementById('tourn-winner-prize');
  if (winnerPrizeInput) {
    winnerPrizeInput.addEventListener('input', window.updateLiveMatchCardPreview);
    winnerPrizeInput.removeEventListener('input', handleWinnerPrizeInput);
    winnerPrizeInput.addEventListener('input', handleWinnerPrizeInput);
  }

  const imageInput = document.getElementById('tourn-image');
  if (imageInput) imageInput.addEventListener('input', window.updateLiveMatchCardPreview);

  const descInput = document.getElementById('tourn-desc');
  if (descInput) descInput.addEventListener('input', window.updateLiveMatchCardPreview);

  const roomIdInput = document.getElementById('tourn-room-id');
  if (roomIdInput) roomIdInput.addEventListener('input', window.updateLiveMatchCardPreview);

  const roomPassInput = document.getElementById('tourn-room-pass');
  if (roomPassInput) roomPassInput.addEventListener('input', window.updateLiveMatchCardPreview);

  const statusInput = document.getElementById('tourn-status');
  if (statusInput) statusInput.addEventListener('change', window.updateLiveMatchCardPreview);
}

// Attach listeners cleanly on both modules initialization and standard load triggers
initTournaments();
document.addEventListener('DOMContentLoaded', initTournaments);
window.addEventListener('load', initTournaments);