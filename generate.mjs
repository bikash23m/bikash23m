import fs from "node:fs";

const username = process.env.GH_USERNAME;
const token = process.env.GH_TOKEN;
const output = process.env.OUTPUT_PATH || "github-jet.svg";

if (!username) {
  throw new Error("Missing GH_USERNAME");
}

if (!token) {
  throw new Error("Missing GH_TOKEN");
}

const query = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          weeks {
            contributionDays {
              date
              contributionCount
              color
            }
          }
        }
      }
    }
  }
`;

async function fetchContributions() {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "github-jet-heatmap"
    },
    body: JSON.stringify({
      query,
      variables: {
        login: username
      }
    })
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error ${response.status}: ${await response.text()}`
    );
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(JSON.stringify(data.errors));
  }

  if (!data.data?.user) {
    throw new Error(`GitHub user "${username}" was not found`);
  }

  return data.data.user.contributionsCollection.contributionCalendar.weeks;
}

function buildCells(weeks) {
  const recentWeeks = weeks.slice(-34);

  const cells = [];

  recentWeeks.forEach((week, column) => {
    week.contributionDays.forEach((day, row) => {
      cells.push({
        x: 20 + column * 14,
        y: 15 + row * 14,
        color: day.color || "#161b22",
        count: day.contributionCount || 0,
        column,
        row
      });
    });
  });

  return cells;
}

function chooseTargets(cells) {
  return [...cells]
    .filter(cell => cell.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

function createGrid(cells, targets) {
  const targetKeys = new Set(
    targets.map(cell => `${cell.column}-${cell.row}`)
  );

  return cells
    .map(cell => {
      const key = `${cell.column}-${cell.row}`;
      const isTarget = targetKeys.has(key);

      if (!isTarget) {
        return `
<rect
  x="${cell.x}"
  y="${cell.y}"
  width="11"
  height="11"
  rx="2"
  fill="${cell.color}"
/>`;
      }

      return `
<rect
  x="${cell.x}"
  y="${cell.y}"
  width="11"
  height="11"
  rx="2"
  fill="${cell.color}"
>
  <animate
    attributeName="fill"
    values="${cell.color};#39d353;${cell.color}"
    dur="20s"
    repeatCount="indefinite"
  />
</rect>`;
    })
    .join("\n");
}

function createBullets(targets) {
  return targets
    .map((cell, index) => {
      const delay = (index * 1.5).toFixed(2);

      return `
<circle
  cx="${cell.x + 5.5}"
  cy="140"
  r="2.5"
  fill="#7ee787"
>
  <animate
    attributeName="cy"
    values="140;${cell.y + 5.5};140"
    dur="20s"
    begin="${delay}s"
    repeatCount="indefinite"
  />
  <animate
    attributeName="opacity"
    values="0;1;0"
    dur="20s"
    begin="${delay}s"
    repeatCount="indefinite"
  />
</circle>`;
    })
    .join("\n");
}

function createStars() {
  const stars = [
    [8, 20],
    [8, 60],
    [8, 100],
    [505, 25],
    [505, 70],
    [505, 110],
    [30, 164],
    [483, 164]
  ];

  return stars
    .map(
      ([x, y], index) => `
<circle
  cx="${x}"
  cy="${y}"
  r="1.1"
  fill="#8b949e"
>
  <animate
    attributeName="opacity"
    values="0.2;1;0.2"
    dur="${1.2 + index * 0.15}s"
    repeatCount="indefinite"
  />
</circle>`
    )
    .join("\n");
}

function createJet() {
  return `
<g>
  <polygon
    points="0,-16 8,6 4,3 -4,3 -8,6"
    fill="#58a6ff"
    stroke="#1f6feb"
    stroke-width="1"
  />

  <polygon
    points="-8,6 -14,12 -4,7"
    fill="#388bfd"
  />

  <polygon
    points="8,6 14,12 4,7"
    fill="#388bfd"
  />

  <circle
    cx="0"
    cy="-6"
    r="2.2"
    fill="#c9e6ff"
  />

  <polygon
    points="-3,7 3,7 0,15"
    fill="#f0883e"
  >
    <animate
      attributeName="opacity"
      values="0.5;1;0.6;1"
      dur="0.18s"
      repeatCount="indefinite"
    />
  </polygon>

  <animateTransform
    attributeName="transform"
    type="translate"
    dur="20s"
    repeatCount="indefinite"
    keyTimes="0;0.5;1"
    values="35,140;478,140;35,140"
  />
</g>`;
}

function createSvg(weeks) {
  const cells = buildCells(weeks);
  const targets = chooseTargets(cells);

  const grid = createGrid(cells, targets);
  const bullets = createBullets(targets);
  const stars = createStars();
  const jet = createJet();

  return `<?xml version="1.0" encoding="UTF-8"?>

<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 513 170"
>

  <rect
    x="0"
    y="0"
    width="513"
    height="170"
    fill="#0d1117"
  />

  ${stars}

  <g id="contribution-grid">
    ${grid}
  </g>

  <g id="jet-bullets">
    ${bullets}
  </g>

  ${jet}

</svg>
`;
}

async function main() {
  console.log(`Fetching GitHub contributions for ${username}...`);

  const weeks = await fetchContributions();

  const svg = createSvg(weeks);

  const directory = output.includes("/")
    ? output.substring(0, output.lastIndexOf("/"))
    : ".";

  fs.mkdirSync(directory, {
    recursive: true
  });

  fs.writeFileSync(output, svg, "utf8");

  console.log(`Successfully generated ${output}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
