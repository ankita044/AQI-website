// ✅ script.js

// Example list of cities for autocomplete suggestions
const cities = [
    'Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad', 'Pune', 
    'Kolkata', 'Ahmedabad', 'Jaipur', 'Lucknow'
  ];
  
  // Get the search bar element
  const searchBar = document.getElementById('search-bar');
  
  searchBar.addEventListener('input', () => {
    const value = searchBar.value.toLowerCase();
  
    // Filter cities based on user input
    let suggestions = cities.filter(city => city.toLowerCase().includes(value));
    
    let dropdown = document.querySelector('.autocomplete-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('ul');
      dropdown.classList.add('autocomplete-dropdown');
      searchBar.parentNode.appendChild(dropdown);
    }
  
    // Clear previous suggestions
    dropdown.innerHTML = '';
  
    // Create suggestions in the dropdown
    suggestions.forEach(city => {
      const option = document.createElement('li');
      option.textContent = city;
      option.addEventListener('click', () => {
        searchBar.value = city;
        dropdown.innerHTML = '';
      });
      dropdown.appendChild(option);
    });
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!searchBar.contains(e.target)) {
      const dropdown = document.querySelector('.autocomplete-dropdown');
      if (dropdown) dropdown.innerHTML = '';
    }
  });
  