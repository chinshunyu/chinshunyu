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
    // Get user info - contains karma, completed_count, completed_today
    console.log('Fetching user info...');
    let userInfo = {};
    const userResponse = await fetch(`${baseUrl}/user`, { headers });
    if (userResponse.ok) {
      userInfo = await userResponse.json();
      console.log('User info:', JSON.stringify({
        karma: userInfo.karma,
        completed_count: userInfo.completed_count,
        completed_today: userInfo.completed_today,
        daily_goal: userInfo.daily_goal,
        weekly_goal: userInfo.weekly_goal
      }, null, 2));
    } else {
      const errorText = await userResponse.text();
      console.log(`User endpoint error: ${userResponse.status} - ${errorText}`);
    }

    // Get active tasks count
    console.log('Fetching tasks...');
    let totalActiveTasks = 0;
    const tasksResponse = await fetch(`${baseUrl}/tasks`, { headers });
    
    if (tasksResponse.ok) {
      const tasksData = await tasksResponse.json();
      totalActiveTasks = tasksData.results ? tasksData.results.length : (Array.isArray(tasksData) ? tasksData.length : 0);
      console.log('Total active tasks:', totalActiveTasks);
    } else {
      const errorText = await tasksResponse.text();
      console.log(`Tasks endpoint error: ${tasksResponse.status} - ${errorText}`);
    }

    // Use data from user endpoint
    const stats = {
      karmaPoints: userInfo?.karma || 0,
      todayCompleted: userInfo?.completed_today || 0,
      totalCompleted: userInfo?.completed_count || 0,
      totalActiveTasks: totalActiveTasks,
      lastUpdated: new Date().toISOString()
    };

    console.log('Final stats:', stats);
    return stats;
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
📋 ${stats.totalActiveTasks} tasks remaining`;
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
