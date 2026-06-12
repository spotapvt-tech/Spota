export function drawTripRecapCanvas(canvas, { trip, tripSpots, members, votes }) {
  const ctx = canvas.getContext('2d');
  const w = 1080;
  const h = 1920;

  // 1. Draw Background Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, '#121413'); // Matte dark
  bgGrad.addColorStop(0.5, '#1A231E'); // Deep forest accent
  bgGrad.addColorStop(1, '#0D0E0D');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 2. Draw Glass Orb Highlights (Ambient light glows)
  // Sage Green Orb (Top Right)
  const sageGlow = ctx.createRadialGradient(850, 300, 50, 850, 300, 450);
  sageGlow.addColorStop(0, 'rgba(108, 140, 116, 0.22)');
  sageGlow.addColorStop(1, 'rgba(108, 140, 116, 0)');
  ctx.fillStyle = sageGlow;
  ctx.beginPath();
  ctx.arc(850, 300, 450, 0, Math.PI * 2);
  ctx.fill();

  // Terracotta Orb (Bottom Left)
  const terraGlow = ctx.createRadialGradient(200, 1500, 50, 200, 1500, 500);
  terraGlow.addColorStop(0, 'rgba(224, 122, 95, 0.18)');
  terraGlow.addColorStop(1, 'rgba(224, 122, 95, 0)');
  ctx.fillStyle = terraGlow;
  ctx.beginPath();
  ctx.arc(200, 1500, 500, 0, Math.PI * 2);
  ctx.fill();

  // 3. Draw Ambient Diagonal Grid Lines (Subtle premium styling)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
  ctx.lineWidth = 1;
  for (let i = -h; i < w; i += 120) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h, h);
    ctx.stroke();
  }

  // 4. Header Branding
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.font = "bold 44px 'Outfit', sans-serif";
  ctx.fillText('💎  S P O T A', w / 2, 180);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = "bold 20px 'Outfit', sans-serif";
  ctx.fillText('T R I P   W R A P P E D   R E C A P', w / 2, 235);

  // 5. Trip Summary Card (Large Box)
  // Background Box
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(100, 320, 880, 260, 32);
  ctx.fill();
  ctx.stroke();

  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = "bold 64px 'Outfit', sans-serif";
  ctx.fillText(trip.name || 'Kasol Group Trip', w / 2, 420);

  // Destination / Date
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = "600 28px 'Outfit', sans-serif";
  const destText = trip.destination ? `📍 ${trip.destination}` : '📍 Flexible Destination';
  ctx.fillText(destText, w / 2, 485);

  ctx.fillStyle = 'var(--color-accent, #6C8C74)';
  ctx.font = "600 24px 'Outfit', sans-serif";
  const formatDates = (s, e) => {
    if (!s) return 'Flexible Dates';
    const sDate = new Date(s).toLocaleDateString([], { month: 'short', day: 'numeric' });
    if (!e) return sDate;
    const eDate = new Date(e).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    return `${sDate} - ${eDate}`;
  };
  ctx.fillText(formatDates(trip.start_date, trip.end_date), w / 2, 535);

  // 6. Analytics Stats Grid (4 Cards)
  const drawStatTile = (x, y, label, val, iconCode) => {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, 420, 280, 24);
    ctx.fill();
    ctx.stroke();

    // Icon
    ctx.fillStyle = 'rgba(108, 140, 116, 0.15)';
    ctx.beginPath();
    ctx.arc(x + 70, y + 70, 40, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = "32px 'Outfit', sans-serif";
    ctx.fillText(iconCode, x + 70, y + 80);

    // Label
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = "bold 20px 'Outfit', sans-serif";
    ctx.fillText(label.toUpperCase(), x + 40, y + 160);

    // Value
    ctx.fillStyle = '#FFFFFF';
    ctx.font = "bold 48px 'Outfit', sans-serif";
    ctx.fillText(val, x + 40, y + 230, 340);
  };

  // Calculations
  const totalPinned = tripSpots.length;
  const visitedCount = tripSpots.filter(ts => ts.visited).length;
  
  // Find top spot by votes
  const getSpotVotes = (sId) => votes.filter(v => v.spot_id === sId).length;
  let topSpotName = 'None';
  let maxVotes = -1;
  tripSpots.forEach(ts => {
    const vCount = getSpotVotes(ts.spot_id);
    if (vCount > maxVotes && ts.spots) {
      maxVotes = vCount;
      topSpotName = ts.spots.title;
    }
  });

  // Find top contributor (who added the most spots)
  const contributorMap = {};
  tripSpots.forEach(ts => {
    if (ts.added_by) {
      contributorMap[ts.added_by] = (contributorMap[ts.added_by] || 0) + 1;
    }
  });
  let topContributorName = 'Explorer';
  let maxAdds = -1;
  Object.keys(contributorMap).forEach(userId => {
    if (contributorMap[userId] > maxAdds) {
      maxAdds = contributorMap[userId];
      const member = members.find(m => m.user_id === userId);
      if (member && member.profiles) {
        topContributorName = member.profiles.username;
      }
    }
  });

  // Draw Grid Tiles
  drawStatTile(100, 640, 'Locations Pinned', `${totalPinned}`, '📍');
  drawStatTile(560, 640, 'Places Visited', `${visitedCount} / ${totalPinned}`, '✅');
  drawStatTile(100, 960, 'Top Voted Spot', topSpotName, '🔥');
  drawStatTile(560, 960, 'Top Contributor', topContributorName, '👑');

  // 7. Vibe Profile (Categories Visited)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(100, 1280, 880, 220, 24);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = "bold 20px 'Outfit', sans-serif";
  ctx.fillText('TRIP VIBE PALETTE', 140, 1340);

  // Draw Unique categories visited as inline emoji badges
  const uniqueCategories = [...new Set(tripSpots.map(ts => ts.spots?.category).filter(Boolean))];
  const catEmojis = {
    'cafe': '☕ Cafe',
    'viewpoint': '🌅 View',
    'street-art': '🎨 Art',
    'event': '🎫 Event',
    'trail': '🥾 Trail',
    'campsite': '⛺ Camp',
    'waterfall': '💦 Water',
    'mountain': '🏔️ Peak',
    'beach': '🏖️ Beach',
    'lake': '🌊 Lake',
    'forest': '🌲 Woods',
    'cave': '🕳️ Cave'
  };

  let drawX = 140;
  uniqueCategories.slice(0, 4).forEach((catId) => {
    const label = catEmojis[catId] || '💎 Spot';
    
    // Draw pill background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    const textWidth = ctx.measureText(label).width + 30;
    ctx.beginPath();
    ctx.roundRect(drawX, 1370, textWidth, 60, 30);
    ctx.fill();

    // Draw emoji text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = "bold 22px 'Outfit', sans-serif";
    ctx.fillText(label, drawX + 15, 1408);

    drawX += textWidth + 20;
  });

  if (uniqueCategories.length === 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = "italic 22px 'Outfit', sans-serif";
    ctx.fillText('No spots visited yet to generate vibes.', 140, 1400);
  }

  // 8. Footer Branding QR code
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.beginPath();
  ctx.roundRect(100, 1560, 880, 220, 24);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = "bold 28px 'Outfit', sans-serif";
  if (trip.agency_name) {
    ctx.fillText(`PLANNED BY ${trip.agency_name.toUpperCase()}`, 140, 1640);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = "500 18px 'Outfit', sans-serif";
    ctx.fillText('CURATED COLLABORATIVELY ON SPOTA', 140, 1685);
    ctx.fillStyle = '#8e44ad';
    ctx.font = "bold 16px 'Outfit', sans-serif";
    ctx.fillText('💎 SPOTA VERIFIED PARTNER', 140, 1725);
  } else {
    ctx.fillText('PLAN YOUR NEXT GEM WITH FRIENDS', 140, 1650);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = "500 18px 'Outfit', sans-serif";
    ctx.fillText('DOWNLOAD SPOTA ON IOS & ANDROID', 140, 1690);
  }

  // Mock QR code grid at bottom right of footer card
  const qrX = 800;
  const qrY = 1600;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(qrX, qrY, 130, 130);
  
  ctx.fillStyle = '#121413';
  ctx.fillRect(qrX + 10, qrY + 10, 35, 35);
  ctx.fillRect(qrX + 85, qrY + 10, 35, 35);
  ctx.fillRect(qrX + 10, qrY + 85, 35, 35);
  ctx.fillRect(qrX + 50, qrY + 50, 30, 30);
  ctx.fillRect(qrX + 25, qrY + 60, 15, 15);
  ctx.fillRect(qrX + 65, qrY + 25, 15, 15);
}
