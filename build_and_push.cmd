docker login
docker buildx build --platform=linux/arm64/v8 --push -t danyver/firefly-iii-ai-categorize:latest .