FROM ghcr.io/berriai/litellm-non_root:v1.83.7-stable.patch.1

# Switch to root to write into the image filesystem
USER root

# Create tiktoken cache directory and copy the pre-downloaded cl100k_base BPE file.
# The cache filename is sha1("https://openaipublic.blob.core.windows.net/encodings/cl100k_base.tiktoken")
# = 9b5ad71b2ce5302211f9c61530b329a4922fc6a4
RUN mkdir -p /tiktoken_cache
COPY tiktoken_cache/9b5ad71b2ce5302211f9c61530b329a4922fc6a4 /tiktoken_cache/9b5ad71b2ce5302211f9c61530b329a4922fc6a4
RUN chmod 644 /tiktoken_cache/9b5ad71b2ce5302211f9c61530b329a4922fc6a4

# Permanently set the cache dir so tiktoken never attempts a network download
ENV CUSTOM_TIKTOKEN_CACHE_DIR=/tiktoken_cache

# Restore non-root user
USER nobody
