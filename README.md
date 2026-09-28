# WEB在线私人电子书阅读系统

一个部署在 **Cloudflare Pages** 上的私人在线阅读器。书籍文件**只在本机浏览器中解析阅读，不上传、不在服务器存储任何数据**。

## 特性

- **EPUB 阅读**：epub.js 分页渲染，目录 / 字号 / 左右翻页 / 触摸滑动
- **TXT 阅读**：自动识别 UTF-8 / GBK 编码，按「第 X 章」智能切分章节
- **三套主题**：纸（米白）/ 杏（暖黄）/ 夜（深色），宋体 / 黑体切换
- **私人书库**：拖拽导入书籍，自动提取书名、作者、封面（EPUB）
- **进度记忆**：阅读进度保存在本机，下次打开继续读
- **零服务器存储**：书籍缓存在浏览器 IndexedDB，元数据在 localStorage，隐私无忧

## 本地预览

任选其一：

```bash
# Python
cd public && python -m http.server 8080

# Node
npx serve public
```

打开 http://localhost:8080，拖入一本 EPUB 或 TXT 即可阅读。

## 部署到 Cloudflare Pages

### 方式一：命令行（推荐）

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy public --project-name=private-library
```

部署完成后会得到 `https://private-library.pages.dev`，之后每次更新重新执行 `deploy` 即可。

### 方式二：控制台拖拽

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Upload assets**
2. 项目名填 `private-library`，把 `public` 文件夹拖进去，点 **Deploy**

### 方式三：连接 Git 仓库

把本项目推到 GitHub/GitLab，在 Pages 创建项目时选择仓库，构建命令留空、输出目录填 `public`。

### 绑定自定义域名（可选）

Pages 项目 → **Custom domains** → 添加你的域名，按提示加 CNAME 记录即可。

## 数据与隐私

| 数据 | 位置 | 说明 |
|---|---|---|
| 书籍文件本体 | 浏览器 IndexedDB | 导入时写入，永远不离开你的设备 |
| 书名/作者/进度 | localStorage | 换设备或清除浏览器数据后需重新导入 |

清除方法：浏览器设置 → 清除站点数据；或在书架上点书封右上角「×」逐本移除。

## 已知限制

- 书籍保存在浏览器里，**换浏览器 / 换设备 / 清缓存后需要重新导入**（这是"不做任何存储"的代价）
- 浏览器对 IndexedDB 有空间配额（Chrome 一般为磁盘的很大比例），超大书库（数 GB）可能受限
- EPUB 解析依赖 jsdelivr CDN 的 epub.js / JSZip，离线状态无法使用

## 目录结构

```
public/
  index.html      书架（导入 / 搜索 / 移除）
  reader.html     阅读器（EPUB / TXT）
  css/style.css   设计系统（三主题）
  js/db.js        IndexedDB + localStorage 封装
  js/book.js      导入解析（EPUB 元数据 / TXT 编码探测）
  js/shelf.js     书架逻辑
  js/reader.js    阅读器逻辑
tools/
  serve.mjs       本地静态服务器（验证用）
  gen_mockdata.py 生成样例书（验证用）
```
