const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');

async function fetchTodoistStats(apiKey) {
  const baseUrl = 'https://api.todoist.com/api/v1';
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  try {
    // Get productivity stats using the new unified API v1
    const statsResponse = await fetch(`${baseUrl}/user/productivity_stats`, { headers });
    
    let productivityStats = {};
    if (statsResponse.ok) {
      productivityStats = await statsResponse.json();
    } else {
      console.log(`Productivity stats: ${statsResponse.status} - trying alternative approach`);
    }

    // Get active tasks count using the new unified API v1
    let totalActiveTasks = 0;
    const tasksResponse = await fetch(`${baseUrl}/tasks`, { headers });
    
    if (tasksResponse.ok) {
      const tasksData = await tasksResponse.json();
      // Handle paginated response
      totalActiveTasks = tasksData.results ? tasksData.results.length : (Array.isArray(tasksData) ? tasksData.length : 0);
    } else {
      console.log(`Tasks endpoint: ${tasksResponse.status}`);
    }

    // Get user info
    let userInfo = {};
    const userResponse = await fetch(`${baseUrl}/user`, { headers });
    if (userResponse.ok) {
      userInfo = await userResponse.json();
    }

    // Extract stats from available data
    const todayCompleted = productivityStats.days_items && productivityStats.days_items.length > 0 
      ? productivityStats.days_items[0].total_completed || 0 
      : 0;

    return {
      karmaPoints: userInfo?.karma || productivityStats?.karma || 0,
      todayCompleted: todayCompleted,
      totalCompleted: productivityStats?.completed_count || 0,
      currentStreak: productivityStats?.goals?.current_daily_streak?.count || 0,
      longestStreak: productivityStats?.goals?.max_daily_streak?.count || 0,
      totalActiveTasks: totalActiveTasks,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    core.setFailed(`Error fetching Todoist stats: ${error.message}`);
    throw error;
  }
}

function generateStatsText(stats) {
  const lastUpdated = new Date(stats.lastUpdated).toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return `🏆 ${stats.karmaPoints} Karma Points           
🌸 Completed ${stats.todayCompleted} tasks today           
✅ Completed ${stats.totalCompleted} tasks so far           
⏳ Longest streak is ${stats.longestStreak} days`;
}

async function updateReadme(statsText, githubToken) {
  const octokit = github.getOctokit(githubToken);
  const context = github.context;

  try {
    // Get current README content
    const { data: readmeData } = await octokit.rest.repos.getContent({
      owner: context.repo.owner,
      repo: context.repo.repo,
      path: 'README.md'
    });

    const readmeContent = Buffer.from(readmeData.content, 'base64').toString();
    
    // Replace content between markers
    const startMarker = '<!-- TODO-IST:START -->';
    const endMarker = '<!-- TODO-IST:END -->';
    
    const startIndex = readmeContent.indexOf(startMarker);
    const endIndex = readmeContent.indexOf(endMarker);
    
    if (startIndex === -1 || endIndex === -1) {
      throw new Error('Could not find TODO-IST markers in README.md');
    }
    
    const beforeMarker = readmeContent.substring(0, startIndex + startMarker.length);
    const afterMarker = readmeContent.substring(endIndex);
    
    const newContent = `${beforeMarker}\n${statsText}\n${afterMarker}`;
    
    // Update README
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: context.repo.owner,
      repo: context.repo.repo,
      path: 'README.md',
      message: 'Update Todoist stats',
      content: Buffer.from(newContent).toString('base64'),
      sha: readmeData.sha
    });

    console.log('README updated successfully');
  } catch (error) {
    core.setFailed(`Error updating README: ${error.message}`);
    throw error;
  }
}

async function run() {
  try {
    const todoistApiKey = core.getInput('todoist_api_key');
    const githubToken = core.getInput('github_token');

    if (!todoistApiKey) {
      throw new Error('Todoist API key is required');
    }

    console.log('Fetching Todoist stats...');
    const stats = await fetchTodoistStats(todoistApiKey);
    
    console.log('Generating stats text...');
    const statsText = generateStatsText(stats);
    
    console.log('Updating README...');
    await updateReadme(statsText, githubToken);
    
    console.log('Todoist stats updated successfully!');
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
