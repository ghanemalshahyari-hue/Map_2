#!/bin/bash

# Script to save Docker images for Kubernetes offline deployment
# Run this on a machine with internet access where the images can be pulled

mkdir -p images

echo "========================================="
echo "Pulling latest specified images..."
echo "========================================="
docker pull ghcr.io/berriai/litellm:main-v1.49.1
docker pull redis:alpine

echo ""
echo "========================================="
echo "Saving LiteLLM image to tar archive..."
echo "========================================="
# Using standard output redirection for compatibility
docker save ghcr.io/berriai/litellm:main-v1.49.1 > images/litellm.tar
echo "LiteLLM saved successfully: images/litellm.tar"

echo ""
echo "========================================="
echo "Saving Redis image to tar archive..."
echo "========================================="
docker save redis:alpine > images/redis.tar
echo "Redis saved successfully: images/redis.tar"

echo ""
echo "========================================="
echo "Done!"
echo "Transfer the 'images' directory to your air-gapped cluster nodes."
echo ""
echo "To load them on the cluster, run:"
echo "  docker load -i images/litellm.tar"
echo "  docker load -i images/redis.tar"
echo ""
echo "If your cluster uses containerd (like k3s/k8s), use this instead:"
echo "  ctr -n k8s.io images import images/litellm.tar"
echo "  ctr -n k8s.io images import images/redis.tar"
echo "========================================="
docker pull docker.litellm.ai/berriai/litellm-non_root:main-stable
docker pull docker.litellm.ai/berriai/litellm-non_root:main-stable