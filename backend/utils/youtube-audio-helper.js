require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ytdl = require('@distube/ytdl-core');

/**
 * YouTube音声ダウンロードと文字起こし処理
 */
class YouTubeAudioHelper {
  constructor() {
    this.tempDir = path.join(__dirname, '../../temp');
    
    // 一時ディレクトリを作成
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * ytdl-coreを使用した音声ダウンロード（主要な方法）
   * @param {string} youtubeUrl YouTube動画URL
   * @returns {Promise<string>} ダウンロードされた音声ファイルのパス
   */
  async downloadAudioWithYtdl(youtubeUrl) {
    return new Promise(async (resolve, reject) => {
      try {
        const videoId = this.extractVideoId(youtubeUrl);
        if (!videoId) {
          return reject(new Error('Invalid YouTube URL'));
        }

        const outputPath = path.join(this.tempDir, `${videoId}.mp4`);
        
        console.log(`🎬 Downloading audio with ytdl-core: ${youtubeUrl}`);
        console.log(`📁 Output path: ${outputPath}`);

        // 動画情報を取得
        const info = await ytdl.getInfo(youtubeUrl);
        const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
        
        if (audioFormats.length === 0) {
          return reject(new Error('No audio formats available for this video'));
        }

        // 最高品質の音声を選択
        const format = audioFormats[0];
        console.log(`Selected audio format: ${format.container}, quality: ${format.qualityLabel || 'unknown'}`);

        const stream = ytdl(youtubeUrl, {
          quality: 'highestaudio',
          filter: 'audioonly'
        });

        const writeStream = fs.createWriteStream(outputPath);
        
        stream.pipe(writeStream);

        stream.on('error', (error) => {
          console.error(`❌ Download stream error: ${error.message}`);
          reject(error);
        });

        writeStream.on('error', (error) => {
          console.error(`❌ Write stream error: ${error.message}`);
          reject(error);
        });

        writeStream.on('finish', () => {
          if (fs.existsSync(outputPath)) {
            console.log(`✅ Audio download successful: ${outputPath}`);
            resolve(outputPath);
          } else {
            reject(new Error('Audio file was not created'));
          }
        });

      } catch (error) {
        console.error(`❌ ytdl-core download failed: ${error.message}`);
        reject(error);
      }
    });
  }

  /**
   * YouTube URLから音声をダウンロード（yt-dlp fallback）
   * @param {string} youtubeUrl YouTube動画URL
   * @returns {Promise<string>} ダウンロードされた音声ファイルのパス
   */
  async downloadAudio(youtubeUrl) {
    return new Promise((resolve, reject) => {
      const videoId = this.extractVideoId(youtubeUrl);
      if (!videoId) {
        return reject(new Error('Invalid YouTube URL'));
      }

      const outputPath = path.join(this.tempDir, `${videoId}.%(ext)s`);
      const finalAudioPath = path.join(this.tempDir, `${videoId}.mp3`);

      // yt-dlpコマンドを構築
      const args = [
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '0', // 最高品質
        '--output', outputPath,
        '--no-playlist',
        '--ignore-errors',
        youtubeUrl
      ];

      console.log(`🎬 Downloading audio from YouTube: ${youtubeUrl}`);
      console.log(`📁 Output path: ${finalAudioPath}`);

      const ytdlp = spawn('yt-dlp', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      ytdlp.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(`yt-dlp: ${data.toString().trim()}`);
      });

      ytdlp.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(`yt-dlp error: ${data.toString().trim()}`);
      });

      ytdlp.on('close', (code) => {
        if (code === 0) {
          // ダウンロード成功確認
          if (fs.existsSync(finalAudioPath)) {
            console.log(`✅ Audio download successful: ${finalAudioPath}`);
            resolve(finalAudioPath);
          } else {
            console.error(`❌ Audio file not found after download: ${finalAudioPath}`);
            reject(new Error('Audio file was not created'));
          }
        } else {
          console.error(`❌ yt-dlp failed with code ${code}`);
          console.error(`stderr: ${stderr}`);
          reject(new Error(`Audio download failed: ${stderr || 'Unknown error'}`));
        }
      });

      ytdlp.on('error', (error) => {
        console.error(`❌ Failed to spawn yt-dlp:`, error);
        reject(new Error(`Failed to run yt-dlp: ${error.message}`));
      });
    });
  }

  /**
   * pytube-cliを使用した代替ダウンロード方法
   * @param {string} youtubeUrl YouTube動画URL
   * @returns {Promise<string>} ダウンロードされた音声ファイルのパス
   */
  async downloadAudioWithPytube(youtubeUrl) {
    return new Promise((resolve, reject) => {
      const videoId = this.extractVideoId(youtubeUrl);
      if (!videoId) {
        return reject(new Error('Invalid YouTube URL'));
      }

      const outputPath = path.join(this.tempDir, `${videoId}.mp4`);

      // pytube-cliコマンドを構築
      const args = [
        youtubeUrl,
        '--audio',
        '--output-path', this.tempDir,
        '--filename', `${videoId}.mp4`
      ];

      console.log(`🎬 Downloading audio with pytube: ${youtubeUrl}`);

      const pytube = spawn('pytube', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pytube.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(`pytube: ${data.toString().trim()}`);
      });

      pytube.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(`pytube error: ${data.toString().trim()}`);
      });

      pytube.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          console.log(`✅ Audio download successful with pytube: ${outputPath}`);
          resolve(outputPath);
        } else {
          console.error(`❌ pytube failed with code ${code}`);
          reject(new Error(`Pytube download failed: ${stderr || 'Unknown error'}`));
        }
      });

      pytube.on('error', (error) => {
        console.error(`❌ Failed to spawn pytube:`, error);
        reject(new Error(`Failed to run pytube: ${error.message}`));
      });
    });
  }

  /**
   * 4段階フォールバック音声ダウンロード
   * @param {string} youtubeUrl YouTube動画URL
   * @returns {Promise<string>} ダウンロードされた音声ファイルのパス
   */
  async downloadAudioWithFallback(youtubeUrl) {
    console.log(`🎯 Starting 4-tier audio download for: ${youtubeUrl}`);

    // 1段階目: ytdl-core (最も信頼性が高い)
    try {
      console.log('🔄 Attempting download with ytdl-core...');
      return await this.downloadAudioWithYtdl(youtubeUrl);
    } catch (error) {
      console.error('❌ ytdl-core failed:', error.message);
    }

    // 2段階目: yt-dlp
    try {
      console.log('🔄 Attempting download with yt-dlp...');
      return await this.downloadAudio(youtubeUrl);
    } catch (error) {
      console.error('❌ yt-dlp failed:', error.message);
    }

    // 3段階目: pytube
    try {
      console.log('🔄 Attempting download with pytube...');
      return await this.downloadAudioWithPytube(youtubeUrl);
    } catch (error) {
      console.error('❌ pytube failed:', error.message);
    }

    // 4段階目: youtube-dl (最後の手段)
    try {
      console.log('🔄 Attempting download with youtube-dl (fallback)...');
      return await this.downloadAudioWithYoutubeDl(youtubeUrl);
    } catch (error) {
      console.error('❌ All download methods failed');
      throw new Error(`音声ダウンロードに失敗しました: ${error.message}`);
    }
  }

  /**
   * youtube-dlを使用した最終フォールバック
   * @param {string} youtubeUrl YouTube動画URL
   * @returns {Promise<string>} ダウンロードされた音声ファイルのパス
   */
  async downloadAudioWithYoutubeDl(youtubeUrl) {
    return new Promise((resolve, reject) => {
      const videoId = this.extractVideoId(youtubeUrl);
      if (!videoId) {
        return reject(new Error('Invalid YouTube URL'));
      }

      const outputPath = path.join(this.tempDir, `${videoId}.%(ext)s`);
      const finalAudioPath = path.join(this.tempDir, `${videoId}.mp3`);

      const args = [
        '--extract-audio',
        '--audio-format', 'mp3',
        '--output', outputPath,
        youtubeUrl
      ];

      console.log(`🎬 Downloading audio with youtube-dl: ${youtubeUrl}`);

      const youtubedl = spawn('youtube-dl', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderr = '';

      youtubedl.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      youtubedl.on('close', (code) => {
        if (code === 0 && fs.existsSync(finalAudioPath)) {
          resolve(finalAudioPath);
        } else {
          reject(new Error(`youtube-dl failed: ${stderr}`));
        }
      });

      youtubedl.on('error', (error) => {
        reject(new Error(`Failed to run youtube-dl: ${error.message}`));
      });
    });
  }

  /**
   * 音声ファイルを文字起こし
   * @param {string} audioFilePath 音声ファイルのパス
   * @returns {Promise<string>} 文字起こしテキスト
   */
  async transcribeAudio(audioFilePath) {
    try {
      console.log(`🎙️ Starting transcription for: ${audioFilePath}`);
      
      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      // ファイルサイズチェック
      const stats = fs.statSync(audioFilePath);
      const fileSizeMB = stats.size / (1024 * 1024);
      console.log(`📊 Audio file size: ${fileSizeMB.toFixed(2)} MB`);

      if (fileSizeMB > 25) {
        console.log('⚠️ File size exceeds 25MB, chunking may be required');
      }

      // WhisperServiceのインスタンスを取得
      const whisperService = require('./whisper-service');

      const transcription = await whisperService.transcribeAudio(audioFilePath, {
        language: 'ja',
        temperature: 0.1
      });

      console.log(`✅ Transcription completed: ${transcription.length} characters`);
      return transcription;

    } catch (error) {
      console.error('❌ Transcription failed:', error);
      throw new Error(`音声の文字起こしに失敗しました: ${error.message}`);
    }
  }

  /**
   * YouTube URLから動画IDを抽出
   * @param {string} url YouTube URL
   * @returns {string|null} 動画ID
   */
  extractVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/shorts\/([^&\n?#]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * 一時ファイルをクリーンアップ
   * @param {string} filePath 削除するファイルのパス
   */
  cleanupTempFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Cleaned up temp file: ${filePath}`);
      }
    } catch (error) {
      console.error(`⚠️ Failed to cleanup temp file ${filePath}:`, error.message);
    }
  }

  /**
   * YouTube動画の音声処理（ダウンロード→文字起こし→クリーンアップ）
   * @param {string} youtubeUrl YouTube動画URL
   * @returns {Promise<string>} 文字起こしテキスト
   */
  async processYouTubeAudio(youtubeUrl) {
    let audioFilePath = null;
    
    try {
      console.log(`🎬 Processing YouTube audio for: ${youtubeUrl}`);
      
      // 音声ダウンロード
      audioFilePath = await this.downloadAudioWithFallback(youtubeUrl);
      
      // 文字起こし
      const transcription = await this.transcribeAudio(audioFilePath);
      
      return transcription;
      
    } catch (error) {
      console.error('❌ YouTube audio processing failed:', error);
      throw error;
      
    } finally {
      // 一時ファイルのクリーンアップ
      if (audioFilePath) {
        this.cleanupTempFile(audioFilePath);
      }
    }
  }

  /**
   * 利用可能なダウンロードツールをチェック
   * @returns {Promise<Object>} 利用可能なツールの情報
   */
  async checkAvailableTools() {
    const tools = {
      'ytdl-core': false,
      'yt-dlp': false,
      'pytube': false,
      'youtube-dl': false
    };

    // ytdl-coreはNode.jsパッケージなので常に利用可能
    try {
      require('ytdl-core');
      tools['ytdl-core'] = true;
    } catch (error) {
      console.log('ytdl-core not available');
    }

    // 外部ツールをチェック
    const externalTools = ['yt-dlp', 'pytube', 'youtube-dl'];
    for (const tool of externalTools) {
      try {
        await new Promise((resolve, reject) => {
          const process = spawn(tool, ['--version'], { stdio: 'pipe' });
          process.on('close', (code) => {
            if (code === 0) {
              tools[tool] = true;
              resolve();
            } else {
              reject();
            }
          });
          process.on('error', reject);
        });
      } catch (error) {
        console.log(`${tool} not available`);
      }
    }

    return tools;
  }
}

module.exports = YouTubeAudioHelper;