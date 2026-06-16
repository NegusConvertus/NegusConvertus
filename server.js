/**
 * File Converter Pro - Backend
 * Runs local native tools:
 * - ffmpeg
 * - LibreOffice (soffice)
 * - Tesseract OCR
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const mimeTypes = require('mime-types');

const app = express();
app.use(cors());

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const ROOT_DIR = __dirname;
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const WORK_DIR = path.join(ROOT_DIR, 'work');
const RESULTS_DIR = path.join(ROOT_DIR, 'results');

for (const dir of [UPLOAD_DIR, WORK_DIR, RESULTS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (_req, _file, cb) {
        cb(null, UPLOAD_DIR);
    },
    filename: function (_req, file, cb) {
        const ext = path.extname(file.originalname);
        const base = path.basename(file.originalname, ext).replace(/[^a-z0-9\-_]/gi, '_');
        const stamp = Date.now();
        cb(null, `${base}_${stamp}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB
    }
});

function runCommand(cmd, args, { cwd } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd: cwd || ROOT_DIR,
            shell: false,
            windowsHide: true
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (d) => {
            stdout += d.toString();
        });
        child.stderr.on('data', (d) => {
            stderr += d.toString();
        });

        child.on('error', (err) => {
            reject(err);
        });

        child.on('close', (code) => {
            if (code === 0) resolve({ code, stdout, stderr });
            else {
                const err = new Error(`Command failed: ${cmd} ${args.join(' ')} (exit ${code})`);
                err.stdout = stdout;
                err.stderr = stderr;
                reject(err);
            }
        });
    });
}

function pickExtensionFromTarget(targetFormat) {
    return String(targetFormat).toLowerCase().replace(/\./g, '');
}

function safeExtForFilename(ext) {
    return String(ext).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getBaseName(filePath) {
    return path.basename(filePath, path.extname(filePath));
}

function findConvertedFile(dir, pattern) {
    const files = fs.readdirSync(dir);
    return files
        .filter((f) => pattern.test(f))
        .map((f) => path.join(dir, f))
        .sort()[files.length ? 0 : -1];
}

async function convertWithFFmpeg({ inputPath, outputPath, targetFormat }) {
    const outExt = safeExtForFilename(targetFormat);

    // Minimal but robust defaults.
    // For images: convert first frame if needed.
    const args = ['-y', '-i', inputPath];

    if (outExt === 'png') {
        args.push('-frames:v', '1', outputPath);
    } else if (outExt === 'jpg' || outExt === 'jpeg') {
        args.push('-frames:v', '1', '-q:v', '2', outputPath);
    } else if (outExt === 'webp') {
        args.push('-frames:v', '1', '-q:v', '80', outputPath);
    } else if (outExt === 'pdf') {
        // Convert image to pdf (works for many cases)
        args.push('-frames:v', '1', outputPath);
    } else if (['mp3', 'wav', 'opus'].includes(outExt)) {
        args.push('-vn', '-acodec', outExt === 'opus' ? 'libopus' : (outExt === 'mp3' ? 'libmp3lame' : 'pcm_s16le'), outputPath);
    } else {
        // video/audio fallback
        args.push(outputPath);
    }

    await runCommand('ffmpeg', args);
}

async function convertWithLibreOffice({ inputPath, outputDir, outputExt }) {
    // LibreOffice produces output files inside outputDir.
    // Use --convert-to <ext>:<filter> for predictable results.
    const ext = safeExtForFilename(outputExt);

    // Filters (best-effort; some systems may use slightly different names)
    // pdf <-> docx are the most common paths for this project.
    let convertSpec = ext;
    if (ext === 'docx') {
        // Export to DOCX (MS Word 2007 XML)
        convertSpec = 'docx:MS Word 2007 XML';
    } else if (ext === 'pdf') {
        // Export to PDF
        convertSpec = 'pdf:writer_pdf_Export';
    }

    await runCommand('soffice', [
        '--headless',
        '--nologo',
        '--nolockcheck',
        '--convert-to',
        convertSpec,
        '--outdir',
        outputDir,
        inputPath
    ]);
}

function findLibreOfficeOutput({ outputDir, targetExt, baseName }) {
    const ext = safeExtForFilename(targetExt).toLowerCase();
    const files = fs.readdirSync(outputDir);

    // Prefer outputs that start with original baseName
    const prefer = files
        .filter((f) => f.toLowerCase().startsWith(baseName.toLowerCase()))
        .filter((f) => f.toLowerCase().endsWith(`.${ext}`))
        .map((f) => path.join(outputDir, f));

    if (prefer.length) return prefer.sort()[prefer.length - 1];

    // Fallback: any file with target ext
    const any = files
        .filter((f) => f.toLowerCase().endsWith(`.${ext}`))
        .map((f) => path.join(outputDir, f));

    if (!any.length) return null;
    return any.sort()[any.length - 1];
}


async function ocrToText({ inputPath, outBaseName }) {
    // Tesseract creates: ${outBaseName}.txt
    // On Windows, language packs might be missing; default to eng.
    const outPrefix = path.join(WORK_DIR, outBaseName);

    await runCommand('tesseract', [
        inputPath,
        outPrefix,
        '-l',
        'eng',
        '--oem',
        '1',
        '--psm',
        '3',
        'txt'
    ]);

    const txtPath = `${outPrefix}.txt`;
    if (!fs.existsSync(txtPath)) {
        throw new Error(`OCR output not found: ${txtPath}`);
    }
    return txtPath;
}

async function textToDocOrPdf({ inputTxtPath, targetExt }) {
    const outExt = safeExtForFilename(targetExt);

    // LibreOffice can convert text to docx/pdf in many environments.
    await convertWithLibreOffice({
        inputPath: inputTxtPath,
        outputDir: RESULTS_DIR,
        outputExt: outExt
    });

    const base = path.basename(inputTxtPath, path.extname(inputTxtPath));
    // LibreOffice naming may be: <basename>.<ext>
    const candidate = findConvertedFile(RESULTS_DIR, new RegExp(`^${base}.*\\.${outExt}$`, 'i'));
    if (!candidate) {
        // fallback: any file ending with targetExt
        const candidates = fs.readdirSync(RESULTS_DIR)
            .filter((f) => f.toLowerCase().endsWith(`.${outExt}`))
            .map((f) => path.join(RESULTS_DIR, f));
        if (!candidates.length) throw new Error('Converted file not found (LibreOffice text->doc).');
        return candidates.sort()[candidates.length - 1];
    }
    return candidate;
}

app.post('/api/convert', upload.single('file'), async (req, res) => {
    try {
        const category = String(req.body.category || '').toLowerCase();
        const targetFormatRaw = String(req.body.targetFormat || '');
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
        if (!category) return res.status(400).json({ error: 'Missing category.' });
        if (!targetFormatRaw) return res.status(400).json({ error: 'Missing targetFormat.' });

        const targetFormat = pickExtensionFromTarget(targetFormatRaw);

        const inputPath = req.file.path;
        const originalName = req.file.originalname;
        const baseName = path.basename(originalName, path.extname(originalName));

        // Clean previous results (best-effort)
        // Remove only files matching baseName prefix.
        for (const f of fs.readdirSync(RESULTS_DIR)) {
            if (f.startsWith(baseName + '_') || f.startsWith(baseName + '-') || f.startsWith(baseName)) {
                try { fs.unlinkSync(path.join(RESULTS_DIR, f)); } catch (_) { }
            }
        }

        const outName = `${baseName}.${targetFormat}`;
        const outPath = path.join(RESULTS_DIR, outName);

        // OCR mode: if target is docx/pdf
        const wantsDoc = ['docx', 'pdf'].includes(targetFormat);

        // Decide if OCR needed
        const needsOCR = wantsDoc && (category === 'image');

        if (category === 'audio' || category === 'video' || category === 'image') {
            if (needsOCR) {
                // 1) OCR to .txt
                const txtBase = `${baseName}_ocr_${Date.now()}`;
                const txtPath = await ocrToText({ inputPath, outBaseName: txtBase });

                // 2) txt -> docx/pdf via LibreOffice
                const converted = await textToDocOrPdf({ inputTxtPath: txtPath, targetExt: targetFormat });

                // Move/rename to predictable output name
                fs.copyFileSync(converted, outPath);
            } else {
                // ffmpeg conversion
                // Ensure output dir is correct file name
                await convertWithFFmpeg({ inputPath, outputPath: outPath, targetFormat });
            }
        } else if (category === 'document') {
            // LibreOffice conversion
            await convertWithLibreOffice({ inputPath, outputDir: RESULTS_DIR, outputExt: targetFormat });

            // Try to pick output
            const converted = findConvertedFile(RESULTS_DIR, new RegExp(`^${baseName}.*\\.${targetFormat}$`, 'i'))
                || findConvertedFile(RESULTS_DIR, new RegExp(`^.*\\.${targetFormat}$`, 'i'));
            if (!converted) throw new Error('LibreOffice output not found.');
            fs.copyFileSync(converted, outPath);
        } else {
            throw new Error('Unknown category');
        }

        if (!fs.existsSync(outPath)) {
            throw new Error(`Output file missing: ${outPath}`);
        }

        const mimeType = mimeTypes.lookup(outPath) || 'application/octet-stream';
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(outPath)}"`);
        res.sendFile(outPath);
    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: err.message || 'Conversion failed',
            stderr: err.stderr || undefined
        });
    }
});

app.use(express.static(ROOT_DIR));

app.listen(PORT, () => {
    console.log(`File Converter Pro backend running on http://localhost:${PORT}`);
    console.log('Expect native binaries: ffmpeg, soffice, tesseract in PATH.');
});

