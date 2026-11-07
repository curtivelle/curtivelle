# Keep CRM private

The public Git repository excludes `/quotation-app/`. Existing tracked CRM files
were removed from the local Git index only; local files remain available for the
separate private CRM release builder. Do not use `git add -f quotation-app`.

Git ignore does not remove already deployed files or earlier Git history. To block
an existing copy on the public website, add `public-crm-block.conf` INSIDE the
existing public site's server block(s) in CloudPanel's Vhost editor. Do not replace
the complete Vhost and do not apply this snippet to `crm.curtivelle.com`.

Verify both `/quotation-app` and `/quotation-app/index.html` return 404 for
`curtivelle.com` and `www.curtivelle.com`, including any redirect destination. If
Cloudflare previously cached these URLs, purge those specific cached URLs as well.
The separate CRM domain should continue to present Google sign-in normally.

No Git push, remote site change, cache purge or Git-history rewrite is performed
by these local edits. Keep a private backup of the now-untracked CRM source.
