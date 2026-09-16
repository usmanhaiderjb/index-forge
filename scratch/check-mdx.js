const fs = require('fs');
const path = require('path');
const { compile } = require('next-mdx-remote/rsc');

async function testAll() {
  const dir = path.join(process.cwd(), 'content', 'blog');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.mdx'));
  let errors = 0;

  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    // Remove frontmatter
    const parts = raw.split('---');
    const content = parts.slice(2).join('---');

    try {
      // test compilation
      // Using next-mdx-remote MDX compile logic
      const { MDXRemote } = require('next-mdx-remote/rsc');
    } catch (e) {
      console.error(e);
    }
  }
}
