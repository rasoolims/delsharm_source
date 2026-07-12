import express from 'express';
import fs from 'fs';
import path from 'path';
import { simpleGit } from 'simple-git';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import * as yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const git = simpleGit();
const PORT = 3000;

// Paths
const postsDir = path.join(__dirname, 'src', 'content', 'blog');
const commentsDir = path.join(__dirname, 'src', 'content', 'comments');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper: Count comments per post
function getCommentCounts() {
    const counts = {};
    if (fs.existsSync(commentsDir)) {
        const files = fs.readdirSync(commentsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(commentsDir, file), 'utf8');
                const parsed = yaml.load(content);
                if (parsed && parsed.postSlug) {
                    counts[parsed.postSlug] = (counts[parsed.postSlug] || 0) + 1;
                }
            } catch (e) {
                console.error(`Error parsing comment file: ${file}`, e);
            }
        }
    }
    return counts;
}

// 1. Serve the HTML Portal
app.get('/', (req, res) => {
    const commentCounts = getCommentCounts();
    let files = [];
    if (fs.existsSync(postsDir)) {
        files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md') || f.endsWith('.mdx'));
    }
    
    let postsData = [];

    // Parse each file to extract Title, Date, and Slug
    for (const file of files) {
        const content = fs.readFileSync(path.join(postsDir, file), 'utf-8');
        const parsed = matter(content);
        const slug = file.replace(/\.mdx?$/, '');
        
        postsData.push({
            filename: file,
            slug: slug,
            title: parsed.data.title || file,
            date: new Date(parsed.data.date || 0).getTime(),
            comments: commentCounts[slug] || 0
        });
    }

    // Sort posts by date (Reverse Chronological: Newest First)
    postsData.sort((a, b) => b.date - a.date);

    const html = `
    <html lang="fa" dir="rtl">
    <head>
        <meta charset="utf-8">
        <title>پنل مدیریت دلشرم</title>
        <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;700&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Vazirmatn', Tahoma, sans-serif; background: #f4f6f7; padding: 20px; color: #333; }
            .container { max-width: 900px; margin: auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
            
            .header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 2px solid #eee; }
            .header-bar h1 { margin: 0; }
            .header-actions { display: flex; gap: 10px; }
            
            .post-item { display: flex; justify-content: space-between; align-items: center; padding: 15px 10px; border-bottom: 1px solid #eee; transition: background 0.2s; }
            .post-item:hover { background: #f9f9f9; }
            .post-info { display: flex; flex-direction: column; gap: 5px; }
            
            .meta-tag { font-size: 0.85em; color: #7f8c8d; background: #ecf0f1; padding: 3px 8px; border-radius: 10px; display: inline-block; width: fit-content; }
            
            button { background: #3498db; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-weight: bold; font-family: inherit; transition: background 0.2s; }
            button:hover:not(:disabled) { opacity: 0.9; }
            button:disabled { opacity: 0.6; cursor: not-allowed; }
            
            .btn-pull { background: #27ae60; }
            .btn-new { background: #9b59b6; }
            .btn-comments { background: #e67e22; margin-left: 5px; }
            .btn-cancel { background: #e74c3c; margin-right: 10px; }
            .btn-delete { background: #c0392b; font-size: 0.8em; padding: 5px 10px; }
            
            textarea { width: 100%; height: 400px; margin-top: 20px; padding: 15px; direction: ltr; font-family: monospace; border: 1px solid #ccc; border-radius: 8px; font-size: 14px; line-height: 1.5; }
            
            /* Pagination */
            .pagination { display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 20px; flex-wrap: wrap; }
            .page-btn { background: #ecf0f1; color: #333; min-width: 35px; padding: 8px 12px; }
            .page-btn.active { background: #3498db; color: white; }
            .page-ellipsis { color: #7f8c8d; font-weight: bold; padding: 0 5px; }

            /* Comments Section */
            .comment-card { background: #f9f9f9; padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px; position: relative; }
            .comment-card h4 { margin: 0 0 10px 0; color: #2c3e50; }
            .reply-box { margin-top: 15px; padding-top: 15px; border-top: 1px dashed #ccc; }
            .reply-textarea { height: 80px; direction: rtl; font-family: inherit; margin-bottom: 10px; width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px;}
            .comment-actions { display: flex; justify-content: space-between; align-items: flex-end; }
        </style>
    </head>
    <body>
        <div class="container">
            
            <div id="dashboard-view">
                <div class="header-bar">
                    <h1>مدیریت پست‌ها</h1>
                    <div class="header-actions">
                        <button class="btn-new" onclick="createNewPost()">➕ پست جدید</button>
                        <button class="btn-pull" onclick="pullChanges()">⬇️ دریافت دیدگاه‌ها (Git Pull)</button>
                    </div>
                </div>
                <div id="post-list"></div>
                <div id="pagination-controls" class="pagination"></div>
            </div>
            
            <div id="editor-section" style="display:none;">
                <h2 id="editing-title"></h2>
                <textarea id="post-content"></textarea>
                <br><br>
                <button onclick="saveAndCommit()">ذخیره و ارسال به گیت‌هاب</button>
                <button class="btn-cancel" onclick="showDashboard()">لغو</button>
            </div>

            <div id="comments-section" style="display:none;">
                <h2 id="comments-title"></h2>
                <button class="btn-cancel" onclick="showDashboard()" style="margin-bottom: 20px;">بازگشت به داشبورد</button>
                <div id="comments-container"></div>
            </div>

        </div>

        <script>
            const ALL_POSTS = ${JSON.stringify(postsData)};
            
            let currentPage = 1;
            const postsPerPage = 20;
            let currentFile = '';

            function showDashboard() {
                document.getElementById('dashboard-view').style.display = 'block';
                document.getElementById('editor-section').style.display = 'none';
                document.getElementById('comments-section').style.display = 'none';
                renderPostList();
            }

            function renderPostList() {
                const start = (currentPage - 1) * postsPerPage;
                const end = start + postsPerPage;
                const paginatedPosts = ALL_POSTS.slice(start, end);

                const html = paginatedPosts.map(post => \`
                    <div class="post-item">
                        <div class="post-info">
                            <strong>\${post.title}</strong>
                            <span class="meta-tag">💬 \${post.comments} دیدگاه</span>
                        </div>
                        <div>
                            <button class="btn-comments" onclick="openComments('\${post.slug}', '\${post.title}')">نظرات</button>
                            <button onclick="editPost('\${post.filename}')">ویرایش</button>
                            <button class="btn-delete" style="margin-right: 5px;" onclick="deletePost('\${post.filename}', event)">🗑️ حذف</button>
                        </div>
                    </div>
                \`).join('');
                
                document.getElementById('post-list').innerHTML = html;
                renderPaginationControls();
            }

            function renderPaginationControls() {
                const totalPages = Math.ceil(ALL_POSTS.length / postsPerPage);
                let html = '';
                
                if (totalPages <= 9) {
                    for (let i = 1; i <= totalPages; i++) {
                        html += \`<button class="page-btn \${i === currentPage ? 'active' : ''}" onclick="goToPage(\${i})">\${i}</button>\`;
                    }
                } else {
                    let pages = new Set();
                    for(let i = 1; i <= 5; i++) pages.add(i);
                    for(let i = totalPages - 2; i <= totalPages; i++) pages.add(i);
                    if (currentPage > 1) pages.add(currentPage - 1);
                    pages.add(currentPage);
                    if (currentPage < totalPages) pages.add(currentPage + 1);
                    
                    let sortedPages = Array.from(pages).sort((a,b) => a - b).filter(p => p > 0 && p <= totalPages);
                    
                    let prev = 0;
                    for (let p of sortedPages) {
                        if (prev && p - prev > 1) {
                            html += \`<span class="page-ellipsis">...</span>\`;
                        }
                        html += \`<button class="page-btn \${p === currentPage ? 'active' : ''}" onclick="goToPage(\${p})">\${p}</button>\`;
                        prev = p;
                    }
                }
                document.getElementById('pagination-controls').innerHTML = html;
            }

            function goToPage(page) {
                currentPage = page;
                renderPostList();
            }

            async function editPost(filename) {
                const res = await fetch('/api/post/' + filename);
                const content = await res.text();
                currentFile = filename;
                
                document.getElementById('dashboard-view').style.display = 'none';
                document.getElementById('editor-section').style.display = 'block';
                document.getElementById('editing-title').innerText = 'در حال ویرایش: ' + filename;
                document.getElementById('post-content').value = content;
            }

            function createNewPost() {
                const slug = prompt("لطفاً نام فایل (انگلیسی و بدون فاصله) را وارد کنید:");
                if (!slug) return;
                
                const title = prompt("عنوان پست را وارد کنید:");
                if (!title) return;

                const filename = slug.endsWith('.md') ? slug : slug + '.md';
                currentFile = filename;
                
                const dateISO = new Date().toISOString();
                const template = \`---
title: "\${title}"
date: "\${dateISO}"
jalaliDate: ""
tags: []
pinned: false
---

متن پست خود را اینجا بنویسید...
\`;
                
                document.getElementById('dashboard-view').style.display = 'none';
                document.getElementById('editor-section').style.display = 'block';
                document.getElementById('editing-title').innerText = 'ایجاد پست جدید: ' + filename;
                document.getElementById('post-content').value = template;
            }

            async function saveAndCommit() {
                const content = document.getElementById('post-content').value;
                const btn = document.querySelector('button[onclick="saveAndCommit()"]');
                btn.innerText = 'در حال ذخیره و ارسال...';
                btn.disabled = true;
                
                const res = await fetch('/api/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: currentFile, content: content })
                });

                if(res.ok) {
                    alert('با موفقیت ذخیره و به گیت‌هاب ارسال شد!');
                    location.reload();
                } else {
                    alert('خطا در ذخیره یا ارسال');
                    btn.innerText = 'ذخیره و ارسال به گیت‌هاب';
                    btn.disabled = false;
                }
            }

            async function deletePost(filename, event) {
                if (!confirm('آیا از حذف این پست مطمئن هستید؟ این عملیات مستقیماً در گیت‌هاب اعمال شده و غیرقابل بازگشت است!')) return;
                
                const btn = event.target;
                const originalText = btn.innerText;
                btn.innerText = 'در حال حذف و ارسال...';
                btn.disabled = true;

                const res = await fetch('/api/delete-post', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: filename })
                });

                if (res.ok) {
                    alert('پست با موفقیت حذف و به گیت‌هاب ارسال شد.');
                    location.reload();
                } else {
                    alert('خطا در حذف پست');
                    btn.innerText = originalText;
                    btn.disabled = false;
                }
            }

            async function openComments(slug, title) {
                document.getElementById('dashboard-view').style.display = 'none';
                document.getElementById('comments-section').style.display = 'block';
                document.getElementById('comments-title').innerText = 'دیدگاه‌های: ' + title;
                document.getElementById('comments-container').innerHTML = '<p>در حال بارگذاری...</p>';

                const res = await fetch('/api/comments/' + slug);
                const comments = await res.json();

                if (comments.length === 0) {
                    document.getElementById('comments-container').innerHTML = '<p>هیچ دیدگاهی برای این پست ثبت نشده است.</p>';
                    return;
                }

                let html = '';
                comments.forEach(c => {
                    const existingReply = c.adminResponse ? c.adminResponse.message : '';
                    const btnLabel = c.adminResponse ? 'ویرایش پاسخ و ارسال' : 'ثبت پاسخ و ارسال';

                    html += \`
                    <div class="comment-card" id="comment-\${c.filename.replace('.yml', '')}">
                        <h4>\${c.name} (\${new Date(c.date).toLocaleDateString('fa-IR')})</h4>
                        <p style="white-space: pre-wrap;">\${c.message}</p>
                        
                        <div class="reply-box">
                            <textarea id="reply-\${c.filename}" class="reply-textarea" placeholder="پاسخ خود را اینجا بنویسید...">\${existingReply}</textarea><br>
                            <div class="comment-actions">
                                <button onclick="submitReply('\${c.filename}', event)">\${btnLabel}</button>
                                <button class="btn-delete" onclick="deleteComment('\${c.filename}', event)">🗑️ حذف دیدگاه</button>
                            </div>
                        </div>
                    </div>
                    \`;
                });
                
                document.getElementById('comments-container').innerHTML = html;
            }

            async function submitReply(commentFilename, event) {
                const replyText = document.getElementById('reply-' + commentFilename).value;
                if (!replyText.trim()) { alert('پاسخ نمی‌تواند خالی باشد!'); return; }
                
                const btn = event.target;
                const originalText = btn.innerText;
                btn.innerText = 'در حال ثبت و ارسال...';
                btn.disabled = true;

                const res = await fetch('/api/reply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: commentFilename, message: replyText })
                });

                if(res.ok) {
                    alert('پاسخ با موفقیت ثبت و به گیت‌هاب ارسال شد!');
                    btn.innerText = 'ثبت و ارسال شد';
                    btn.disabled = false;
                } else {
                    alert('خطا در ثبت پاسخ');
                    btn.innerText = originalText;
                    btn.disabled = false;
                }
            }

            async function deleteComment(commentFilename, event) {
                if (!confirm('آیا از حذف این دیدگاه مطمئن هستید؟ این عملیات مستقیماً در گیت‌هاب اعمال شده و غیرقابل بازگشت است!')) return;
                
                const btn = event.target;
                const originalText = btn.innerText;
                btn.innerText = 'در حال حذف و ارسال...';
                btn.disabled = true;

                const res = await fetch('/api/delete-comment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: commentFilename })
                });

                if (res.ok) {
                    alert('دیدگاه با موفقیت حذف و به گیت‌هاب ارسال شد.');
                    btn.closest('.comment-card').remove();
                } else {
                    alert('خطا در حذف دیدگاه');
                    btn.innerText = originalText;
                    btn.disabled = false;
                }
            }

            async function pullChanges() {
                const btn = document.querySelector('.btn-pull');
                const originalText = btn.innerText;
                btn.innerText = 'در حال دریافت اطلاعات...';
                btn.disabled = true;

                try {
                    const res = await fetch('/api/pull', { method: 'POST' });
                    if(res.ok) {
                        alert('تغییرات با موفقیت از سرور دریافت شد!');
                        location.reload();
                    } else {
                        const errorMsg = await res.text();
                        alert('خطا در دریافت اطلاعات: ' + errorMsg);
                    }
                } catch (e) {
                    alert('خطا در ارتباط با سرور.');
                }
                
                btn.innerText = originalText;
                btn.disabled = false;
            }

            renderPostList();
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// 2. API: Get Post Content
app.get('/api/post/:filename', (req, res) => {
    const filePath = path.join(postsDir, req.params.filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    res.send(content);
});

// 3. API: Save Post, Commit, and Auto-Push
app.post('/api/save', async (req, res) => {
    const { filename, content } = req.body;
    const filePath = path.join(postsDir, filename);
    
    try {
        fs.writeFileSync(filePath, content, 'utf-8');
        await git.add(filePath);
        await git.commit(`Update post ${filename} via local portal`);
        await git.push(); // AUTO PUSH
        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
});

// 4. API: Delete Post, Commit, and Auto-Push
app.post('/api/delete-post', async (req, res) => {
    const { filename } = req.body;
    const filePath = path.join(postsDir, filename);
    
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            await git.add(filePath);
            await git.commit(`Deleted post ${filename} via local portal`);
            await git.push(); // AUTO PUSH
            res.sendStatus(200);
        } else {
            res.status(404).send('Post file not found');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
});

// 5. API: Get Comments for a specific Slug
app.get('/api/comments/:slug', (req, res) => {
    const slug = req.params.slug;
    const results = [];
    if (fs.existsSync(commentsDir)) {
        const files = fs.readdirSync(commentsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
        for(const file of files) {
            try {
                const content = fs.readFileSync(path.join(commentsDir, file), 'utf8');
                const parsed = yaml.load(content);
                if(parsed.postSlug === slug) {
                    results.push({ filename: file, ...parsed });
                }
            } catch (e) {
                console.error(`Error reading ${file}`, e);
            }
        }
    }
    results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    res.json(results);
});

// 6. API: Submit Admin Reply, Commit, and Auto-Push
app.post('/api/reply', async (req, res) => {
    const { filename, message } = req.body;
    const filepath = path.join(commentsDir, filename);
    
    try {
        const content = fs.readFileSync(filepath, 'utf8');
        const parsed = yaml.load(content);
        
        parsed.adminResponse = {
            date: new Date().toISOString(),
            message: message
        };
        
        fs.writeFileSync(filepath, yaml.dump(parsed), 'utf8');
        await git.add(filepath);
        await git.commit(`Admin reply added/updated on comment ${filename}`);
        await git.push(); // AUTO PUSH
        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
});

// 7. API: Delete a Comment, Commit, and Auto-Push
app.post('/api/delete-comment', async (req, res) => {
    const { filename } = req.body;
    const filepath = path.join(commentsDir, filename);
    
    try {
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            await git.add(filepath);
            await git.commit(`Deleted comment ${filename} via local portal`);
            await git.push(); // AUTO PUSH
            res.sendStatus(200);
        } else {
            res.status(404).send('Comment file not found');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
});

// 8. API: Git Pull
app.post('/api/pull', async (req, res) => {
    try {
        await git.pull();
        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
});

app.listen(PORT, () => {
    console.log(`✅ Portal running! Open http://localhost:${PORT} in your browser.`);
});