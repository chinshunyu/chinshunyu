const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');

async function fetchTodoistStats(apiKey) {
  const syncUrl = 'https://api.todoist.com/sync/v9/sync';
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  try {
    // Use sync API to get user data and productivity stats
    const syncData = new URLSearchParams({
      sync_token: '*',
      resource_types: '["user", "user_settings"]'
    });

    const syncResponse = await fetch(syncUrl, {
      method: 'POST',
      headers: headers,
      body: syncData
    });

    if (!syncResponse.ok) {
      throw new Error(`Failed to fetch sync data: ${syncResponse.status} ${syncResponse.statusText}`);
    }

    const syncResult = await syncResponse.json();
    const user = syncResult.user;

    // Get productivity stats using the dedicated endpoint
    const statsUrl = 'https://api.todoist.com/sync/v9/completed/get_stats';
    const statsResponse = await fetch(statsUrl, { 
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    let productivityStats = {};
    if (statsResponse.ok) {
      productivityStats = await statsResponse.json();
    } else {
      console.log('Productivity stats endpoint not available, using basic user data');
    }

    // Get active tasks count
    const tasksData = new URLSearchParams({
      sync_token: '*',
      resource_types: '["items"]'
    });

    const tasksResponse = await fetch(syncUrl, {
      method: 'POST',
      headers: headers,
      body: tasksData
    });

    let totalActiveTasks = 0;
    if (tasksResponse.ok) {
      const tasksResult = await tasksResponse.json();
      totalActiveTasks = tasksResult.items ? tasksResult.items.filter(item => !item.checked).length : 0;
    }

    // Extract stats from available data
    const todayCompleted = productivityStats.days_items && productivityStats.days_items.length > 0 
      ? productivityStats.days_items[0].total_completed || 0 
      : 0;

    return {
      karmaPoints: user?.karma || productivityStats.karma || 0,
      todayCompleted: todayCompleted,
      totalCompleted: productivityStats.completed_count || 0,
      currentStreak: productivityStats.goals?.current_daily_streak?.count || 0,
      longestStreak: productivityStats.goals?.max_daily_streak?.count || 0,
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
