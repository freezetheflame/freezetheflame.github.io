# Makefile for blog management

# Install dependencies
install:
	npm install

# Convert Markdown files to HTML
convert:
	npm run convert

# Create a new post with today's date
create-post:
	npm run create-post

# Convert and then start local server
dev: convert
	npm start

# Help
help:
	@echo "Available commands:"
	@echo "  install     - Install dependencies"
	@echo "  convert     - Convert Markdown files to HTML"
	@echo "  create-post - Create a new post with today's date"
	@echo "  dev         - Convert and start local server"