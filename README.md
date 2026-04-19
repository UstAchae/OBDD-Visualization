# OBDD Visualization

这个项目可以作为一个单独的 Scala 服务部署：后端会提供 `/api` 接口，同时直接托管 `frontend/` 里的静态页面。

## 本地启动

要求：

- Java 21
- sbt

启动：

```bash
sbt run
```

默认监听 `http://localhost:8080`。

也支持通过环境变量覆盖：

```bash
PORT=8080 HOST=0.0.0.0 sbt run
```

## Docker 部署

仓库已经包含 `Dockerfile`，可以直接构建：

```bash
docker build -t obdd-visualization .
docker run -p 8080:8080 -e PORT=8080 obdd-visualization
```

运行后访问：

```text
http://localhost:8080
```

健康检查可用：

```text
GET /api
```

## 部署到云平台

因为项目已经支持读取 `PORT`，适合部署到支持 Docker 的平台，例如：

- Render
- Railway
- Fly.io
- VPS + Docker

通用做法：

1. 把仓库推到 GitHub。
2. 在平台里选择用仓库创建一个 Web Service。
3. 选择 Docker 部署。
4. 平台会自动构建镜像并注入运行时端口。

如果平台需要健康检查路径，填写：

```text
/api
```

## 非 Docker 部署

也可以直接打包成可运行 jar：

```bash
sbt assembly
java -jar target/scala-3.3.3/obdd-backend-assembly-0.1.0-SNAPSHOT.jar
```

注意：运行目录下需要保留 `frontend/` 文件夹，因为首页和前端静态资源会从这里读取。
