document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const providerSelect = document.getElementById('provider');
  const mainCategorySelect = document.getElementById('mainCategory');
  const jsonFileInput = document.getElementById('jsonFile');
  const supabaseUrlInput = document.getElementById('supabaseUrl');
  const supabaseKeyInput = document.getElementById('supabaseKey');
  const importBtn = document.getElementById('importBtn');
  const clearBtn = document.getElementById('clearBtn');
  const progressBar = document.getElementById('progressBar');
  const statusMessage = document.getElementById('statusMessage');
  const resultsBody = document.getElementById('resultsBody');

  // Static main categories
  const mainCategories = [
    "New Releases",
    "Trending Now",
    "Most Played",
    "Exclusive Titles",
    "More Action"
  ];

  // Initialize Supabase client
  let supabaseClient = null;

  // Event listeners
  importBtn.addEventListener('click', handleImport);
  clearBtn.addEventListener('click', clearForm);

  // Handle import process
  async function handleImport() {
    try {
      // Validate inputs
      if (!validateInputs()) {
        return;
      }

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

      updateStatus(`Found ${games.length} games. Starting import...`, 'info');
      
      // Import games to Supabase
      await importGamesToSupabase(games, provider);
      
    } catch (error) {
      console.error('Import error:', error);
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
    // GameMonitize data is directly an array of games
    return data.map(game => ({
      provider_game_id: game.id,
      title: game.title,
      description: game.description,
      instructions: game.instructions,
      slug: generateSlug(game.title),
      category: game.category,
      main_category: mainCategory, // Using selected main category
      tags: game.tags,
      orientation: determineOrientation(game.width, game.height),
      quality_score: null, // Not available in GameMonitize
      width: game.width,
      height: game.height,
      date_modified: null, // Not available in standard format
      date_published: null, // Not available in standard format
      banner_image: null, // Not available directly
      thumbnail_image: game.thumb,
      play_url: game.url,
      provider: 'gamemonitize',
      play_count: 0,
      is_featured: false,
      is_new: true
    }));
  }

  // Process GamePix data
  function processGamepixData(data, mainCategory) {
    // GamePix data is in items property
    if (!data.items || !Array.isArray(data.items)) {
      return [];
    }

    return data.items.map(game => ({
      provider_game_id: game.id,
      title: game.title,
      description: game.description,
      instructions: '', // Not available in GamePix sample
      slug: game.namespace || generateSlug(game.title),
      category: game.category,
      main_category: mainCategory, // Using selected main category
      tags: '', // Not available in the sample
      orientation: game.orientation,
      quality_score: game.quality_score,
      width: game.width,
      height: game.height,
      date_modified: game.date_modified ? new Date(game.date_modified).toISOString() : null,
      date_published: game.date_published ? new Date(game.date_published).toISOString() : null,
      banner_image: game.banner_image,
      thumbnail_image: game.image,
      play_url: game.url,
      provider: 'gamepix',
      play_count: 0,
      is_featured: false,
      is_new: true
    }));
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
        // Check if game already exists
        const { data: existingGames } = await supabaseClient
          .from('games')
          .select('id')
          .eq('provider', provider)
          .eq('provider_game_id', game.provider_game_id)
          .limit(1);
        
        let result;
        let message;
        
        if (existingGames && existingGames.length > 0) {
          // Update existing game
          result = await supabaseClient
            .from('games')
            .update(game)
            .eq('id', existingGames[0].id);
            
          message = 'Updated existing game';
        } else {
          // Insert new game
          result = await supabaseClient
            .from('games')
            .insert(game);
            
          message = 'Inserted new game';
        }
        
        if (result.error) {
          throw new Error(result.error.message);
        }
        
        addResultRow(true, game.title, provider, message);
        successful++;
      } catch (error) {
        console.error(`Error importing game ${game.title}:`, error);
        addResultRow(false, game.title, provider, error.message);
        failed++;
      }
      
      // Update progress
      const progress = ((i + 1) / total) * 100;
      updateProgressBar(progress);
      updateStatus(`Processed ${i + 1} of ${total} games. Success: ${successful}, Failed: ${failed}`, 'info');
    }
    
    updateStatus(`Import completed. Successful: ${successful}, Failed: ${failed}`, successful === total ? 'success' : 'info');
  }

  // Helper function to generate slug
  function generateSlug(title) {
    return title
      .toLowerCase()
      .replace(/[^\w ]+/g, '')
      .replace(/ +/g, '-');
  }

  // Helper function to determine orientation
  function determineOrientation(width, height) {
    if (!width || !height) return 'landscape';
    return parseInt(width) >= parseInt(height) ? 'landscape' : 'portrait';
  }

  // Add a row to results table
  function addResultRow(success, title, provider, message) {
    const row = document.createElement('tr');
    
    const statusCell = document.createElement('td');
    statusCell.textContent = success ? 'Success' : 'Error';
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
    statusMessage.className = 'status-message ' + type;
  }

  // Reset results
  function resetResults() {
    resultsBody.innerHTML = '';
    progressBar.style.width = '0%';
    statusMessage.textContent = '';
    statusMessage.className = 'status-message';
  }

  // Clear form
  function clearForm() {
    jsonFileInput.value = '';
    resetResults();
  }
});