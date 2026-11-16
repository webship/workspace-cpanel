Check a site before it goes to cPanel: its link, its environments, its webship-js suite, then the deploy line.

```
claude --permission-mode bypassPermissions """
Get the site <project> ready to deploy to cPanel, and give me the deploy line
# ~/workspace/<folder> · container-based (DDEV by default) · <folder> is the sites folder of <project>
# do not deploy: the deploy asks for a confirmation in a terminal and that is mine to give
# never print a token or a key; link nothing, pull nothing
# a feature to write or a run to read: the book Automated Functional Testing Recipes first (its README.md, then the matching chapter), from .claude/automated-functional-testing-recipes/ in the project, ~/.claude/automated-functional-testing-recipes/ or https://github.com/webship/webship-js-ai-agent/tree/2.0.x/automated-functional-testing-recipes

1. cd ~/workspace/<folder> ; bash cmd-tools-cpanel.sh <project>
   stop if it is not linked, and show me the line it prints for linking
2. bash cmd-tools-cpanel.sh <project> --environments
   tell me which environment the project works against
3. cd <project> ; git status --short ; git branch --show-current ; cd ..
   tell me what is not committed
4. if cmd-tools-testing.sh and <project>/cucumber.js are both there:
   bash cmd-tools-testing.sh <project> --run
   and keep the totals it prints; if they are not there, say so and do not invent a test run

Then tell me: the link, the environment, what is not committed, and the totals of the suite or
that there is none. If the suite failed, say that first.
Last, the line for me to run, and nothing more:
cd ~/workspace/<folder> && bash cmd-tools-cpanel.sh <project> --push
"""
```

The text between the triple quotes is plain: it can be given to another AI command-line assistant as it is.
