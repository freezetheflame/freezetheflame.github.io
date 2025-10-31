# add all the files and git commit
# git push to github
push:
	git add .
	git commit -m "makefile push"
	git push origin new

# convert markdown files to html
convert:
	npm run convert

# convert and push
convert-push:
	npm run convert
	git add .
	git commit -m "convert markdown to html"
	git push origin new