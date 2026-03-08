const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');

async function fetchTodoistStats(apiKey) {
  const baseUrl = 'https://api.todoist.com/rest/v2';
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  try {
    // Get all active tasks
    const tasksResponse = await fetch(`${baseUrl}/tasks`, { headers });
    if (!tasksResponse.ok) {
      throw new Error(`Failed to fetch tasks: ${tasksResponse.status} ${tasksResponse.statusText}`);
    }
    const tasks = await tasksResponse.json();

    // Get all projects
    const projectsResponse = await fetch(`${baseUrl}/projects`, { headers });
    if (!projectsResponse.ok) {
      throw new Error(`Failed to fetch projects: ${projectsResponse.status} ${projectsResponse.statusText}`);
    }
    const projects = await projectsResponse.json();

    // Calculate stats
    const today = new Date().toISOString().split('T')[0];
    const todayTasks = tasks.filter(task => {
      if (!task.due) return false;
      return task.due.date === today;
    });

    const highPriorityTasks = tasks.filter(task => task.priority >= 3);
    const totalActiveTasks = tasks.length;
    const totalProjects = projects.length;

    return {
      totalActiveTasks,
      todayTasksCount: todayTasks.length,
      highPriorityTasksCount: highPriorityTasks.length,
      totalProjects,
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

  return `📋 **Active Tasks:** ${stats.totalActiveTasks}           
📅 **Due Today:** ${stats.todayTasksCount} tasks           
🔥 **High Priority:** ${stats.highPriorityTasksCount} tasks           
📁 **Projects:** ${stats.totalProjects} active projects           
🕐 **Last Updated:** ${lastUpdated} UTC`;
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
