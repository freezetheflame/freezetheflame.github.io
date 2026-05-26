---
title: How to Understand T2V Models?(Open-Sora MAINLY)
date: 2025-05-15
tags: [Windows相关]
---


### Open-Sora 的典型架构组成：

  1. **Text Encoder** （CLIP or T5）

     * 将文本编码为嵌入向量

     * 通常作为 cross-attention 的 key/value 输入

  2. **Latent Space 编码器/解码器** 

     * 使用 VAE 将视频压缩到隐空间

     * 减少计算量，提升训练效率

  3. **Video Diffusion Transformer (Video DiT)** 

     * 包含多个 **Transformer Block**

     * 每个 Block 内部包含：

       * Spatio-Temporal Attention（空间+时间注意力）

       * Cross-Attention（与文本嵌入交互）

       * FFN（前馈网络）

  4. **Noise Predictor / Denoiser Head** 

     * 预测噪声残差，用于去噪过程
