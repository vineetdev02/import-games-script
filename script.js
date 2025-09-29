document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const providerSelect = document.getElementById('provider');
  const mainCategorySelect = document.getElementById('mainCategory');
  const jsonFileInput = document.getElementById('jsonFile');
  const supabaseUrlInput = document.getElementById('supabaseUrl');
  const supabaseKeyInput = document.getElementById('supabaseKey');
  const saveCredentialsCheckbox = document.getElementById('saveCredentials');
  const importBtn = document.getElementById('importBtn');
  const clearBtn = document.getElementById('clearBtn');
  const progressBar = document.getElementById('progressBar');
  const statusMessage = document.getElementById('statusMessage');
  const resultsBody = document.getElementById('resultsBody');
  const gamePreviewContainer = document.getElementById('gamePreviewContainer');
  const gamesList = document.getElementById('gamesList');
  const submitAllBtn = document.getElementById('submitAllBtn');
  const confirmationModal = document.getElementById('confirmationModal');
  const modalGameList = document.getElementById('modalGameList');
  const confirmUploadBtn = document.getElementById('confirmUploadBtn');
  const cancelUploadBtn = document.getElementById('cancelUploadBtn');
  const closeModalBtn = document.querySelector('.close');

  // New manual entry form elements
  const jsonModeRadio = document.getElementById('jsonMode');
  const manualModeRadio = document.getElementById('manualMode');
  const jsonImportForm = document.getElementById('jsonImportForm');
  const manualEntryForm = document.getElementById('manualEntryForm');
  const manualStoreBtn = document.getElementById('manualStoreBtn');
  const manualPreviewBtn = document.getElementById('manualPreviewBtn');
  const manualClearBtn = document.getElementById('manualClearBtn');

  // Pagination elements
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');
  const pageInfo = document.getElementById('pageInfo');
  const pageSizeSelect = document.getElementById('pageSize');
  const gamesCounter = document.getElementById('gamesCounter');
  const prevPageBtnBottom = document.getElementById('prevPageBtnBottom'); // Added bottom pagination
  const nextPageBtnBottom = document.getElementById('nextPageBtnBottom'); // Added bottom pagination
  const pageInfoBottom = document.getElementById('pageInfoBottom'); // Added bottom pagination

  // Duplicate Games Modal elements
  const duplicateModal = document.getElementById('duplicateModal');
  const duplicateGameList = document.getElementById('duplicateGameList');
  const removeAllDuplicatesBtn = document.getElementById('removeAllDuplicatesBtn');
  const closeDuplicateModalBtn = document.getElementById('closeDuplicateModalBtn');
  const closeDuplicateModalBtnTop = document.querySelector('.close-duplicate'); // Close button in modal header
  const checkDuplicatesBtn = document.getElementById('checkDuplicatesBtn'); // New button

  // Static main categories
const mainCategories = [
  "New Releases",
  "Trending Now",
  "Most Played",
  "Featured Games",
  "Banner Games",
  "Editor's Choice", 
  "All Action Games" 
];

  // Initialize Supabase client
  let supabaseClient = null;
  
  // Store processed games
  let processedGames = [];
  let currentPage = 1;
  let gamesPerPage = parseInt(pageSizeSelect.value); // Initial games per page

  // Load saved Supabase credentials if they exist
  loadSavedCredentials();

  // Event listeners
  importBtn.addEventListener('click', handleImport);
  clearBtn.addEventListener('click', clearForm);
  submitAllBtn.addEventListener('click', showConfirmationModal);
  confirmUploadBtn.addEventListener('click', handleSubmitAll);
  cancelUploadBtn.addEventListener('click', closeModal);
  closeModalBtn.addEventListener('click', closeModal);
  jsonModeRadio.addEventListener('change', toggleImportMode);
  manualModeRadio.addEventListener('change', toggleImportMode);
  manualStoreBtn.addEventListener('click', handleManualStore);
  manualPreviewBtn.addEventListener('click', handleManualPreview);
  manualClearBtn.addEventListener('click', clearManualForm);

  // Pagination event listeners
  prevPageBtn.addEventListener('click', () => changePage(-1));
  nextPageBtn.addEventListener('click', () => changePage(1));
  pageSizeSelect.addEventListener('change', changePageSize);
  prevPageBtnBottom.addEventListener('click', () => changePage(-1)); // Added bottom pagination
  nextPageBtnBottom.addEventListener('click', () => changePage(1)); // Added bottom pagination

  // Duplicate Games event listeners
  checkDuplicatesBtn.addEventListener('click', checkDuplicateGames);
  removeAllDuplicatesBtn.addEventListener('click', removeAllDuplicateGames);
  closeDuplicateModalBtn.addEventListener('click', closeDuplicateModal);
  closeDuplicateModalBtnTop.addEventListener('click', closeDuplicateModal); // Close button in modal header
  
  // Close modal if user clicks outside of it
  window.addEventListener('click', (event) => {
    if (event.target === confirmationModal) {
      closeModal();
    }
    if (event.target === duplicateModal) { // Close duplicate modal
      closeDuplicateModal();
    }
  });

  // Toggle between JSON and manual import modes
  function toggleImportMode() {
    if (manualModeRadio.checked) {
      jsonImportForm.classList.add('hidden');
      manualEntryForm.classList.remove('hidden');
    } else {
      jsonImportForm.classList.remove('hidden');
      manualEntryForm.classList.add('hidden');
    }
  }

  // Load saved credentials from localStorage
  function loadSavedCredentials() {
    const savedUrl = localStorage.getItem('supabaseUrl');
    const savedKey = localStorage.getItem('supabaseKey');
    
    if (savedUrl) {
      supabaseUrlInput.value = savedUrl;
    }
    
    if (savedKey) {
      supabaseKeyInput.value = savedKey;
    }
    
    if (savedUrl && savedKey) {
      saveCredentialsCheckbox.checked = true;
    }
  }

  // Save credentials to localStorage
  function saveCredentials() {
    if (saveCredentialsCheckbox.checked) {
      localStorage.setItem('supabaseUrl', supabaseUrlInput.value);
      localStorage.setItem('supabaseKey', supabaseKeyInput.value);
    } else {
      localStorage.removeItem('supabaseUrl');
      localStorage.removeItem('supabaseKey');
    }
  }

  // Handle initial import process to display games for review
  async function handleImport() {
    try {
      // Validate inputs
      if (!validateInputs()) {
        return;
      }

      // Save credentials if checkbox is checked
      saveCredentials();

      // Initialize Supabase client
      initSupabase();

      // Get file and read its content
      const file = jsonFileInput.files[0];
      const provider = providerSelect.value;
      const mainCategory = mainCategorySelect.value;
      
      // Reset UI
      resetResults();
      updateStatus('Reading file...', 'info');
      
      // Read and parse the JSON file
      const fileContent = await readFileAsJson(file);
      if (!fileContent) {
        updateStatus('Failed to read or parse JSON file', 'error');
        return;
      }

      // Process data based on provider
      let games = [];
      if (provider === 'gamemonitize') {
        games = processGamemonitizeData(fileContent, mainCategory);
      } else if (provider === 'gamepix') {
        games = processGamepixData(fileContent, mainCategory);
      }

      if (games.length === 0) {
        updateStatus('No valid games found in the file', 'error');
        return;
      }

      updateStatus(`Found ${games.length} games. Ready for review.`, 'success');
      
      // Store processed games
      processedGames = games;
      currentPage = 1; // Reset to first page
      
      // Display games for review with pagination
      renderGamesList();
      
    } catch (error) {
      console.error('Import error:', error);
      updateStatus(`Error: ${error.message}`, 'error');
    }
  }
  
  // --- Pagination Functions ---
  function renderGamesList() {
    gamesList.innerHTML = ''; // Clear any existing games
    gamePreviewContainer.classList.remove('hidden'); // Show the game preview container

    const totalGames = processedGames.length;
    const totalPages = Math.ceil(totalGames / gamesPerPage);
    
    // Update games counter
    gamesCounter.textContent = `${totalGames} games loaded`;

    // Calculate start and end index for current page
    const startIndex = (currentPage - 1) * gamesPerPage;
    const endIndex = Math.min(startIndex + gamesPerPage, totalGames);
    
    const gamesToDisplay = processedGames.slice(startIndex, endIndex);

    if (gamesToDisplay.length === 0 && totalGames > 0) {
        // If no games on current page but total games exist, go to previous page
        currentPage = Math.max(1, currentPage - 1);
        renderGamesList();
        return;
    }

    gamesToDisplay.forEach((game, index) => {
      // Adjust index to reflect its original position in processedGames
      const originalIndex = startIndex + index;
      const gameCard = document.createElement('div');
      gameCard.className = 'game-item';
      gameCard.dataset.index = originalIndex; // Store original index
      
      // Create the iframe container
      const iframeContainer = document.createElement('div');
      iframeContainer.className = 'game-iframe-container';
      
      // Create the iframe
      const iframe = document.createElement('iframe');
      iframe.className = 'game-iframe';
      iframe.src = game.play_url;
      iframe.setAttribute('allowfullscreen', 'true');
      
      iframeContainer.appendChild(iframe);
      gameCard.appendChild(iframeContainer);
      
      // Create game details section
      const detailsContainer = document.createElement('div');
      detailsContainer.className = 'game-details';
      
      // Create editable title
      const titleLabel = document.createElement('label');
      titleLabel.textContent = 'Title:';
      titleLabel.className = 'detail-label';

      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.className = 'game-title-input';
      titleInput.value = game.title;
      titleInput.dataset.field = 'title';
      titleInput.addEventListener('change', (e) => updateGameData(originalIndex, 'title', e.target.value));
      
      // Create editable description
      const descriptionLabel = document.createElement('label');
      descriptionLabel.textContent = 'Description:';
      descriptionLabel.className = 'detail-label';

      const descriptionTextarea = document.createElement('textarea');
      descriptionTextarea.className = 'game-description';
      descriptionTextarea.value = game.description;
      descriptionTextarea.rows = 4;
      descriptionTextarea.dataset.field = 'description';
      descriptionTextarea.addEventListener('change', (e) => updateGameData(originalIndex, 'description', e.target.value));

      // Create editable instructions
      const instructionsLabel = document.createElement('label');
      instructionsLabel.textContent = 'Instructions:';
      instructionsLabel.className = 'detail-label';

      const instructionsTextarea = document.createElement('textarea');
      instructionsTextarea.className = 'game-instructions';
      instructionsTextarea.value = game.instructions || '';
      instructionsTextarea.rows = 3;
      instructionsTextarea.dataset.field = 'instructions';
      instructionsTextarea.addEventListener('change', (e) => updateGameData(originalIndex, 'instructions', e.target.value));
      
      // Create additional details section
      const additionalDetails = document.createElement('div');
      additionalDetails.className = 'additional-details';
      
      // Add category input
      const categoryLabel = document.createElement('label');
      categoryLabel.textContent = 'Category:';
      categoryLabel.className = 'detail-label';

      const categoryInput = document.createElement('input');
      categoryInput.type = 'text';
      categoryInput.className = 'detail-input';
      categoryInput.value = game.category;
      categoryInput.dataset.field = 'category';
      categoryInput.addEventListener('change', (e) => updateGameData(originalIndex, 'category', e.target.value));
      
      // Add main category select
      const mainCategoryLabel = document.createElement('label');
      mainCategoryLabel.textContent = 'Main Category:';
      mainCategoryLabel.className = 'detail-label';

      const mainCategorySelect = document.createElement('select');
      mainCategorySelect.className = 'detail-select';
      mainCategorySelect.dataset.field = 'main_category';
      
      // Add options for each main category
      mainCategories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        option.selected = game.main_category === category;
        mainCategorySelect.appendChild(option);
      });
      
      mainCategorySelect.addEventListener('change', (e) => updateGameData(originalIndex, 'main_category', e.target.value));
      
      // Add tags input
      const tagsLabel = document.createElement('label');
      tagsLabel.textContent = 'Tags:';
      tagsLabel.className = 'detail-label';

      const tagsInput = document.createElement('input');
      tagsInput.type = 'text';
      tagsInput.className = 'detail-input';
      tagsInput.value = game.tags || '';
      tagsInput.dataset.field = 'tags';
      tagsInput.addEventListener('change', (e) => updateGameData(originalIndex, 'tags', e.target.value));
      
      // Add dimensions input
      const dimensionsContainer = document.createElement('div');
      dimensionsContainer.className = 'dimensions-container';
      
      const widthLabel = document.createElement('label');
      widthLabel.textContent = 'Width:';
      widthLabel.className = 'detail-label-small';
      
      const widthInput = document.createElement('input');
      widthInput.type = 'text';
      widthInput.className = 'detail-input-small';
      widthInput.value = game.width || '';
      widthInput.dataset.field = 'width';
      widthInput.addEventListener('change', (e) => updateGameData(originalIndex, 'width', e.target.value));
      
      const heightLabel = document.createElement('label');
      heightLabel.textContent = 'Height:';
      heightLabel.className = 'detail-label-small';
      
      const heightInput = document.createElement('input');
      heightInput.type = 'text';
      heightInput.className = 'detail-input-small';
      heightInput.value = game.height || '';
      heightInput.dataset.field = 'height';
      heightInput.addEventListener('change', (e) => updateGameData(originalIndex, 'height', e.target.value));
      
      dimensionsContainer.appendChild(widthLabel);
      dimensionsContainer.appendChild(widthInput);
      dimensionsContainer.appendChild(heightLabel);
      dimensionsContainer.appendChild(heightInput);
      
      // Add is featured checkbox
      const featuredContainer = document.createElement('div');
      featuredContainer.className = 'featured-container';
      
      const featuredLabel = document.createElement('label');
      featuredLabel.textContent = 'Featured Game:';
      featuredLabel.className = 'detail-label';
      
      const featuredCheckbox = document.createElement('input');
      featuredCheckbox.type = 'checkbox';
      featuredCheckbox.className = 'detail-checkbox';
      featuredCheckbox.checked = game.is_featured || false;
      featuredCheckbox.dataset.field = 'is_featured';
      featuredCheckbox.addEventListener('change', (e) => updateGameData(originalIndex, 'is_featured', e.target.checked));
      
      featuredContainer.appendChild(featuredLabel);
      featuredContainer.appendChild(featuredCheckbox);
      
      // Add game URL input
      const urlLabel = document.createElement('label');
      urlLabel.textContent = 'Game URL:';
      urlLabel.className = 'detail-label';
      
      const urlInput = document.createElement('input');
      urlInput.type = 'text';
      urlInput.className = 'detail-input';
      urlInput.value = game.play_url || '';
      urlInput.dataset.field = 'play_url';
      urlInput.addEventListener('change', (e) => {
        updateGameData(originalIndex, 'play_url', e.target.value);
        // Update iframe src
        iframe.src = e.target.value;
      });
      
      // Add thumbnail image URL input
      const thumbnailLabel = document.createElement('label');
      thumbnailLabel.textContent = 'Thumbnail URL:';
      thumbnailLabel.className = 'detail-label';
      
      const thumbnailInput = document.createElement('input');
      thumbnailInput.type = 'text';
      thumbnailInput.className = 'detail-input';
      thumbnailInput.value = game.thumbnail_image || '';
      thumbnailInput.dataset.field = 'thumbnail_image';
      thumbnailInput.addEventListener('change', (e) => updateGameData(originalIndex, 'thumbnail_image', e.target.value));
      
      // Add actions section
      const actions = document.createElement('div');
      actions.className = 'game-actions';
      
      // Add remove button
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-game-btn';
      removeBtn.textContent = 'Remove Game';
      removeBtn.addEventListener('click', () => removeGame(originalIndex));
      
      // Append all elements
      additionalDetails.appendChild(categoryLabel);
      additionalDetails.appendChild(categoryInput);
      additionalDetails.appendChild(mainCategoryLabel);
      additionalDetails.appendChild(mainCategorySelect);
      additionalDetails.appendChild(tagsLabel);
      additionalDetails.appendChild(tagsInput);
      additionalDetails.appendChild(dimensionsContainer);
      additionalDetails.appendChild(featuredContainer);
      additionalDetails.appendChild(urlLabel);
      additionalDetails.appendChild(urlInput);
      additionalDetails.appendChild(thumbnailLabel);
      additionalDetails.appendChild(thumbnailInput);
      
      actions.appendChild(removeBtn);
      
      detailsContainer.appendChild(titleLabel);
      detailsContainer.appendChild(titleInput);
      detailsContainer.appendChild(descriptionLabel);
      detailsContainer.appendChild(descriptionTextarea);
      detailsContainer.appendChild(instructionsLabel);
      detailsContainer.appendChild(instructionsTextarea);
      detailsContainer.appendChild(additionalDetails);
      detailsContainer.appendChild(actions);
      
      gameCard.appendChild(detailsContainer);
      
      // Add to the games list
      gamesList.appendChild(gameCard);
    });

    updatePaginationControls(totalPages);
  }

  function updatePaginationControls(totalPages) {
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    pageInfoBottom.textContent = `Page ${currentPage} of ${totalPages}`; // Update bottom pagination

    prevPageBtn.disabled = currentPage === 1;
    prevPageBtnBottom.disabled = currentPage === 1; // Update bottom pagination

    nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
    nextPageBtnBottom.disabled = currentPage === totalPages || totalPages === 0; // Update bottom pagination

    // Show/hide pagination controls if there's only one page
    const paginationContainers = document.querySelectorAll('.pagination-controls');
    paginationContainers.forEach(container => {
        if (totalPages <= 1) {
            container.classList.add('hidden');
        } else {
            container.classList.remove('hidden');
        }
    });
  }

  function changePage(direction) {
    const totalPages = Math.ceil(processedGames.length / gamesPerPage);
    currentPage += direction;

    if (currentPage < 1) {
      currentPage = 1;
    } else if (currentPage > totalPages) {
      currentPage = totalPages;
    }
    renderGamesList();
  }

  function changePageSize() {
    gamesPerPage = parseInt(pageSizeSelect.value);
    currentPage = 1; // Reset to first page when page size changes
    renderGamesList();
  }
  
  // Update game data in memory
  function updateGameData(index, field, value) {
    if (index >= 0 && index < processedGames.length) {
      processedGames[index][field] = value;
    }
  }
  
  // Remove a game from the list
  function removeGame(index) {
    if (index >= 0 && index < processedGames.length) {
      // Remove from data array
      processedGames.splice(index, 1);
      
      // Redisplay games with pagination
      renderGamesList();
    }
  }
  
  // Show confirmation modal
  function showConfirmationModal() {
    if (processedGames.length === 0) {
      updateStatus('No games to upload', 'error');
      return;
    }
    
    // Populate the modal with game list
    modalGameList.innerHTML = '';
    
    processedGames.forEach((game, index) => {
      const gameItem = document.createElement('div');
      gameItem.className = 'modal-game-item';
      
      // Create game summary content
      const gameTitle = document.createElement('h3');
      gameTitle.className = 'modal-game-title';
      gameTitle.textContent = game.title;
      
      const gameInfo = document.createElement('div');
      gameInfo.className = 'modal-game-info';
      
      // Add thumbnail
      if (game.thumbnail_image) {
        const thumbnail = document.createElement('img');
        thumbnail.className = 'modal-game-thumbnail';
        thumbnail.src = game.thumbnail_image;
        thumbnail.alt = game.title;
        gameInfo.appendChild(thumbnail);
      }
      
      // Add details
      const gameDetails = document.createElement('div');
      gameDetails.className = 'modal-game-details';
      
      // Add key details
      const categoryText = document.createElement('p');
      categoryText.innerHTML = `<strong>Category:</strong> ${game.category} (${game.main_category})`;
      
      const tagsText = document.createElement('p');
      tagsText.innerHTML = `<strong>Tags:</strong> ${game.tags || 'None'}`;
      
      const dimensionsText = document.createElement('p');
      dimensionsText.innerHTML = `<strong>Dimensions:</strong> ${game.width || 'N/A'} × ${game.height || 'N/A'}`;
      
      const featuredText = document.createElement('p');
      featuredText.innerHTML = `<strong>Featured:</strong> ${game.is_featured ? 'Yes' : 'No'}`;
      
      // Append all details
      gameDetails.appendChild(categoryText);
      gameDetails.appendChild(tagsText);
      gameDetails.appendChild(dimensionsText);
      gameDetails.appendChild(featuredText);
      
      gameInfo.appendChild(gameDetails);
      
      // Append all elements to the game item
      gameItem.appendChild(gameTitle);
      gameItem.appendChild(gameInfo);
      
      modalGameList.appendChild(gameItem);
    });
    
    // Show total count
    const totalCount = document.createElement('div');
    totalCount.className = 'modal-total-count';
    totalCount.textContent = `Total Games: ${processedGames.length}`;
    modalGameList.appendChild(totalCount);
    
    // Show the modal
    confirmationModal.style.display = 'block';
  }
  
  // Close the modal
  function closeModal() {
    confirmationModal.style.display = 'none';
  }
  
  // Handle final submission of all games
  async function handleSubmitAll() {
    try {
      if (processedGames.length === 0) {
        updateStatus('No games to upload', 'error');
        return;
      }
      
      // Close the modal
      closeModal();
      
      // Start the upload process
      await importGamesToSupabase(processedGames, providerSelect.value);
      
      // Clear the review section after successful upload
      gamePreviewContainer.classList.add('hidden');
      processedGames = [];
      
    } catch (error) {
      console.error('Submit error:', error);
      updateStatus(`Error: ${error.message}`, 'error');
    }
  }

  // Validate form inputs
  function validateInputs() {
    if (!jsonFileInput.files.length) {
      updateStatus('Please select a JSON file', 'error');
      return false;
    }

    if (!supabaseUrlInput.value || !supabaseKeyInput.value) {
      updateStatus('Supabase URL and API key are required', 'error');
      return false;
    }

    return true;
  }

  // Initialize Supabase client
  function initSupabase() {
    const supabaseUrl = supabaseUrlInput.value;
    const supabaseKey = supabaseKeyInput.value;
    supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
  }

  // Read file as JSON
  function readFileAsJson(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = function(event) {
        try {
          const jsonData = JSON.parse(event.target.result);
          resolve(jsonData);
        } catch (error) {
          reject(new Error('Invalid JSON file'));
        }
      };
      
      reader.onerror = function() {
        reject(new Error('Error reading file'));
      };
      
      reader.readAsText(file);
    });
  }

  // Process GameMonitize data
  function processGamemonitizeData(data, mainCategory) {
    if (!Array.isArray(data)) {
      console.error('GameMonitize data is not in expected format');
      return [];
    }

    return data.map(game => {
      // Check if game should be featured based on tags or other criteria
      const isFeatured = shouldBeGamemonitizeFeatured(game);

      // Create properly processed game object
      return {
        provider_game_id: game.id,
        title: game.title,
        description: game.description ? game.description.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '',
        instructions: game.instructions || '',
        slug: generateSlug(game.title),
        category: game.category || 'Uncategorized',
        main_category: mainCategory, // <-- FIX: Always use the selected main category
        tags: game.tags || '',
        orientation: determineOrientation(game.width, game.height),
        quality_score: null,
        width: game.width || '800',
        height: game.height || '600',
        date_modified: null,
        date_published: null,
        banner_image: null,
        thumbnail_image: game.thumb || '',
        play_url: game.url || '',
        provider: 'gamemonitize',
        play_count: 0,
        is_featured: isFeatured, // Set the is_featured flag separately
        is_new: true
      };
    });
  }

  // Helper function to determine if a GameMonitize game should be featured
  function shouldBeGamemonitizeFeatured(game) {
    if (!game || !game.tags) return false;
    
    // Define criteria for featuring GameMonitize games
    const featuredTags = ['Best Games', 'Best', 'Top Games', 'Popular'];
    const gameTags = game.tags.toLowerCase();
    
    // Check if any featured tags are present
    return featuredTags.some(tag => gameTags.includes(tag.toLowerCase()));
  }

  // Process GamePix data
  function processGamepixData(data, mainCategory) {
    if (!data.items || !Array.isArray(data.items)) {
      return [];
    }

    return data.items.map(game => {
      // Check if game should be featured based on quality score
      const isFeatured = shouldBeGamepixFeatured(game);
      
      return {
        provider_game_id: game.id,
        title: game.title,
        description: game.description || '',
        instructions: '', // Not available in GamePix sample
        slug: game.namespace || generateSlug(game.title),
        category: game.category || 'Uncategorized',
        main_category: mainCategory, // <-- FIX: Always use the selected main category
        tags: '', // Not available in the sample
        orientation: game.orientation || determineOrientation(game.width, game.height),
        quality_score: game.quality_score,
        width: game.width || '800',
        height: game.height || '600',
        date_modified: game.date_modified ? new Date(game.date_modified).toISOString() : null,
        date_published: game.date_published ? new Date(game.date_published).toISOString() : null,
        banner_image: game.banner_image || null,
        thumbnail_image: game.image || '',
        play_url: game.url || '',
        provider: 'gamepix',
        play_count: 0,
        is_featured: isFeatured, // Set the is_featured flag separately
        is_new: true
      };
    });
  }

  // Helper function to determine if a GamePix game should be featured
  function shouldBeGamepixFeatured(game) {
    // Define criteria for featuring GamePix games
    const QUALITY_SCORE_THRESHOLD = 0.85; // Games with quality score above 85% are featured
    return game.quality_score >= QUALITY_SCORE_THRESHOLD;
  }

  // Import games to Supabase
  async function importGamesToSupabase(games, provider) {
    const total = games.length;
    let successful = 0;
    let failed = 0;
    
    updateProgressBar(0);
    
    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      try {
        // Deep copy the game object and remove any fields that might not be in the database schema
        const gameData = prepareGameData(game);
        
        // Check if game already exists
        const { data: existingGames, error: queryError } = await supabaseClient
          .from('games')
          .select('id')
          .eq('provider', provider)
          .eq('provider_game_id', gameData.provider_game_id)
          .limit(1);
        
        if (queryError) {
          throw new Error(`Database query error: ${queryError.message}`);
        }
        
        let result;
        let message;
        
        if (existingGames && existingGames.length > 0) {
          // Update existing game
          result = await supabaseClient
            .from('games')
            .update(gameData)
            .eq('id', existingGames[0].id);
            
          message = 'Updated existing game';
        } else {
          // Insert new game
          result = await supabaseClient
            .from('games')
            .insert(gameData);
            
          message = 'Inserted new game';
        }
        
        if (result.error) {
          // Provide more detailed error message
          const errorMsg = result.error.message;
          const detailedError = result.error.details ? `: ${result.error.details}` : '';
          throw new Error(`${errorMsg}${detailedError}`);
        }
        
        // Add to results table
        addResultRow(true, gameData.title, provider, message);
        successful++;
      } catch (error) {
        console.error('Error importing game:', error);
        addResultRow(false, game.title, provider, error.message);
        failed++;
      }
      
      // Update progress
      const progress = Math.round(((i + 1) / total) * 100);
      updateProgressBar(progress);
    }
    
    // Update final status
    if (failed === 0) {
      updateStatus(`Successfully imported ${successful} games`, 'success');
    } else {
      updateStatus(`Imported ${successful} games, failed ${failed} games`, 'info');
    }
  }
  
  // Prepare game data for database insertion by removing any fields that might not match the schema
  function prepareGameData(game) {
    // Create a deep copy to avoid modifying the original object
    const gameData = JSON.parse(JSON.stringify(game));
    
    // List of known valid fields in our database schema
    const validFields = [
      'provider_game_id', 'title', 'description', 'instructions', 'slug',
      'category', 'main_category', 'tags', 'orientation', 'quality_score',
      'width', 'height', 'date_modified', 'date_published', 'banner_image',
      'thumbnail_image', 'play_url', 'provider', 'play_count', 'is_featured', 'is_new'
    ];
    
    // Create a new object with only the valid fields
    const cleanedData = {};
    validFields.forEach(field => {
      if (gameData[field] !== undefined) {
        cleanedData[field] = gameData[field];
      }
    });
    
    return cleanedData;
  }

  // Generate URL-friendly slug from game title
  function generateSlug(title) {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove non-word chars
      .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  }

  // Determine game orientation from dimensions
  function determineOrientation(width, height) {
    if (!width || !height) return 'landscape';
    return parseInt(width) >= parseInt(height) ? 'landscape' : 'portrait';
  }

  // Add a result row to the results table
  function addResultRow(success, title, provider, message) {
    const row = document.createElement('tr');
    
    const statusCell = document.createElement('td');
    statusCell.textContent = success ? 'Success' : 'Failed';
    statusCell.className = success ? 'success' : 'error';
    
    const titleCell = document.createElement('td');
    titleCell.textContent = title;
    
    const providerCell = document.createElement('td');
    providerCell.textContent = provider;
    
    const messageCell = document.createElement('td');
    messageCell.textContent = message;
    
    row.appendChild(statusCell);
    row.appendChild(titleCell);
    row.appendChild(providerCell);
    row.appendChild(messageCell);
    
    resultsBody.appendChild(row);
  }

  // Update progress bar
  function updateProgressBar(percentage) {
    progressBar.style.width = `${percentage}%`;
  }

  // Update status message
  function updateStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
  }

  // Reset results UI
  function resetResults() {
    resultsBody.innerHTML = '';
    progressBar.style.width = '0';
    statusMessage.textContent = '';
    statusMessage.className = 'status-message';
  }

  // Clear form fields
  function clearForm() {
    jsonFileInput.value = '';
    resetResults();
    processedGames = [];
    gamePreviewContainer.classList.add('hidden');
    currentPage = 1; // Reset pagination
    
    // Only clear credentials if not saving them
    if (!saveCredentialsCheckbox.checked) {
      supabaseUrlInput.value = '';
      supabaseKeyInput.value = '';
    }
  }

  // --- Manual Entry Functions ---

  function getManualGameData() {
    return {
        provider_game_id: document.getElementById('manual_provider_game_id').value,
        title: document.getElementById('manual_title').value,
        description: document.getElementById('manual_description').value,
        instructions: document.getElementById('manual_instructions').value,
        slug: generateSlug(document.getElementById('manual_title').value),
        category: document.getElementById('manual_category').value,
        main_category: document.getElementById('manual_main_category').value,
        tags: document.getElementById('manual_tags').value,
        orientation: determineOrientation(document.getElementById('manual_width').value, document.getElementById('manual_height').value),
        quality_score: null, // Not available in manual entry
        width: document.getElementById('manual_width').value,
        height: document.getElementById('manual_height').value,
        date_modified: new Date().toISOString(),
        date_published: new Date().toISOString(),
        banner_image: null, // Not available in manual entry
        thumbnail_image: document.getElementById('manual_thumbnail_image').value,
        play_url: document.getElementById('manual_play_url').value,
        provider: document.getElementById('manual_provider').value,
        play_count: 0,
        is_featured: document.getElementById('manual_is_featured').checked,
        is_new: true
    };
  }

  function validateManualInputs(game) {
    if (!game.title || !game.play_url || !game.provider_game_id) {
      updateStatus('Title, Play URL, and Provider Game ID are required for manual entry.', 'error');
      return false;
    }
    if (!supabaseUrlInput.value || !supabaseKeyInput.value) {
      updateStatus('Supabase URL and API key are required', 'error');
      return false;
    }
    return true;
  }

  async function handleManualStore() {
    const game = getManualGameData();

    if (!validateManualInputs(game)) {
      return;
    }

    manualStoreBtn.disabled = true;
    manualStoreBtn.textContent = 'Storing...';

    saveCredentials();
    initSupabase();

    updateStatus('Storing game...', 'info');
    resetResults();

    try {
        await importGamesToSupabase([game], game.provider);
    } catch (error) {
        updateStatus(`An unexpected error occurred: ${error.message}`, 'error');
    } finally {
        manualStoreBtn.disabled = false;
        manualStoreBtn.textContent = 'Store';
    }
  }

  function handleManualPreview() {
    const game = getManualGameData();

    if (!game.title || !game.play_url) {
        updateStatus('Title and Play URL are required for a preview.', 'error');
        return;
    }

    localStorage.setItem('manualGamePreview', JSON.stringify(game));
    window.open('preview.html', '_blank');
  }

  function clearManualForm() {
    document.getElementById('manual_title').value = '';
    document.getElementById('manual_description').value = '';
    document.getElementById('manual_instructions').value = '';
    document.getElementById('manual_play_url').value = '';
    document.getElementById('manual_category').value = '';
    document.getElementById('manual_main_category').value = 'New Releases';
    document.getElementById('manual_tags').value = '';
    document.getElementById('manual_width').value = '800';
    document.getElementById('manual_height').value = '600';
    document.getElementById('manual_thumbnail_image').value = '';
    document.getElementById('manual_provider').value = 'manual';
    document.getElementById('manual_provider_game_id').value = '';
    document.getElementById('manual_is_featured').checked = false;
    resetResults();
  }

  // --- Duplicate Games Functions ---
  async function checkDuplicateGames() {
    if (processedGames.length === 0) {
      updateStatus('No games to check for duplicates.', 'error');
      return;
    }

    updateStatus('Checking for duplicate games...', 'info');
    initSupabase(); // Ensure Supabase client is initialized

    const duplicateFound = [];

    for (const game of processedGames) {
      try {
        const { data: existingGames, error } = await supabaseClient
          .from('games')
          .select('id, title, provider, provider_game_id')
          .or(`provider_game_id.eq.${game.provider_game_id},title.eq.${game.title}`)
          .limit(1);

        if (error) {
          throw new Error(`Supabase query error: ${error.message}`);
        }

        if (existingGames && existingGames.length > 0) {
          duplicateFound.push({
            localGame: game,
            existingGame: existingGames[0]
          });
        }
      } catch (err) {
        console.error('Error checking for duplicate:', err);
        updateStatus(`Error checking duplicates: ${err.message}`, 'error');
        return;
      }
    }

    if (duplicateFound.length > 0) {
      displayDuplicateModal(duplicateFound);
      updateStatus(`${duplicateFound.length} duplicate(s) found.`, 'warning');
    } else {
      updateStatus('No duplicate games found.', 'success');
    }
  }

  function displayDuplicateModal(duplicates) {
    duplicateGameList.innerHTML = ''; // Clear previous duplicates

    duplicates.forEach((dup, index) => {
      const dupItem = document.createElement('div');
      dupItem.className = 'duplicate-game-item';
      dupItem.dataset.index = index; // Store index for removal

      const title = document.createElement('h3');
      title.textContent = dup.localGame.title;

      const details = document.createElement('p');
      details.innerHTML = `<strong>Provider:</strong> ${dup.localGame.provider}<br>
                           <strong>Provider Game ID:</strong> ${dup.localGame.provider_game_id}<br>
                           <strong>Existing Supabase ID:</strong> ${dup.existingGame.id}<br>
                           <strong>Existing Supabase Title:</strong> ${dup.existingGame.title}`;
      
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-duplicate-btn';
      removeBtn.textContent = 'Remove This Duplicate';
      removeBtn.addEventListener('click', () => removeSingleDuplicate(index));

      dupItem.appendChild(title);
      dupItem.appendChild(details);
      dupItem.appendChild(removeBtn);
      duplicateGameList.appendChild(dupItem);
    });

    duplicateModal.style.display = 'block';
  }

  function removeSingleDuplicate(indexToRemove) {
    // Remove the game from processedGames that corresponds to the duplicate entry
    // This requires finding the original game in processedGames based on the duplicate info
    const duplicateEntry = duplicateGameList.children[indexToRemove];
    const localGameTitle = duplicateEntry.querySelector('h3').textContent;
    const localGameProviderId = duplicateEntry.querySelector('p').innerHTML.split('<strong>Provider Game ID:</strong> ')[1].split('<br>')[0];

    const originalIndexInProcessedGames = processedGames.findIndex(game => 
        game.title === localGameTitle && game.provider_game_id === localGameProviderId
    );

    if (originalIndexInProcessedGames !== -1) {
        processedGames.splice(originalIndexInProcessedGames, 1);
        updateStatus(`Removed "${localGameTitle}" from upload list.`, 'info');
    } else {
        console.warn(`Could not find game to remove: ${localGameTitle}`);
    }

    // Re-render the duplicate modal with remaining duplicates
    // Fetch current duplicates again to ensure consistency
    const remainingDuplicates = [];
    const currentDuplicateItems = duplicateGameList.children;
    for (let i = 0; i < currentDuplicateItems.length; i++) {
        if (i !== indexToRemove) {
            // Reconstruct the duplicate object (simplified, could be improved with better data storage)
            const title = currentDuplicateItems[i].querySelector('h3').textContent;
            const providerId = currentDuplicateItems[i].querySelector('p').innerHTML.split('<strong>Provider Game ID:</strong> ')[1].split('<br>')[0];
            const existingId = currentDuplicateItems[i].querySelector('p').innerHTML.split('<strong>Existing Supabase ID:</strong> ')[1].split('<br>')[0];
            const existingTitle = currentDuplicateItems[i].querySelector('p').innerHTML.split('<strong>Existing Supabase Title:</strong> ')[1];

            remainingDuplicates.push({
                localGame: { title: title, provider_game_id: providerId },
                existingGame: { id: existingId, title: existingTitle }
            });
        }
    }
    
    if (remainingDuplicates.length > 0) {
        displayDuplicateModal(remainingDuplicates);
    } else {
        closeDuplicateModal();
        updateStatus('All duplicates removed from the upload list.', 'success');
    }
    renderGamesList(); // Re-render the main game list to reflect removal
  }

  function removeAllDuplicateGames() {
    // Collect all provider_game_id and titles from the duplicate list
    const duplicatesToRemove = [];
    const duplicateItems = duplicateGameList.children;
    for (let i = 0; i < duplicateItems.length; i++) {
        const title = duplicateItems[i].querySelector('h3').textContent;
        const providerId = duplicateItems[i].querySelector('p').innerHTML.split('<strong>Provider Game ID:</strong> ')[1].split('<br>')[0];
        duplicatesToRemove.push({ title: title, provider_game_id: providerId });
    }

    // Filter out games from processedGames that are in the duplicatesToRemove list
    processedGames = processedGames.filter(game => {
        return !duplicatesToRemove.some(dup => 
            dup.title === game.title && dup.provider_game_id === game.provider_game_id
        );
    });

    updateStatus(`Removed ${duplicatesToRemove.length} duplicate games from the upload list.`, 'info');
    closeDuplicateModal();
    renderGamesList(); // Re-render the main game list to reflect removal
  }

  function closeDuplicateModal() {
    duplicateModal.style.display = 'none';
  }

});