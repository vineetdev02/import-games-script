document.addEventListener('DOMContentLoaded', () => {
  const gameTitle = document.getElementById('gameTitle');
  const gameIframe = document.getElementById('gameIframe');
  const gameDescription = document.getElementById('gameDescription');
  const gameInstructions = document.getElementById('gameInstructions');
  const gameCategory = document.getElementById('gameCategory');
  const gameMainCategory = document.getElementById('gameMainCategory');
  const gameTags = document.getElementById('gameTags');
  const gameDimensions = document.getElementById('gameDimensions');
  const gameProvider = document.getElementById('gameProvider');
  const gameFeatured = document.getElementById('gameFeatured');

  const gameData = JSON.parse(localStorage.getItem('manualGamePreview'));

  if (gameData) {
    gameTitle.textContent = gameData.title;
    gameIframe.src = gameData.play_url;
    gameDescription.textContent = gameData.description;
    gameInstructions.textContent = gameData.instructions;
    gameCategory.textContent = gameData.category;
    gameMainCategory.textContent = gameData.main_category;
    gameTags.textContent = gameData.tags;
    gameDimensions.textContent = `${gameData.width}x${gameData.height}`;
    gameProvider.textContent = gameData.provider;
    gameFeatured.textContent = gameData.is_featured ? 'Yes' : 'No';
  }
});