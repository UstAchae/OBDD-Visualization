FROM sbtscala/scala-sbt:eclipse-temurin-21.0.8_9_1.11.7_3.7.3 AS build

WORKDIR /app

COPY project ./project
COPY build.sbt ./

RUN sbt update

COPY backend ./backend
COPY frontend ./frontend

RUN sbt assembly
RUN cp $(find /app/target -name "obdd-backend-assembly-0.1.0-SNAPSHOT.jar" | head -n 1) /app/app.jar

FROM eclipse-temurin:21-jre

WORKDIR /app

ENV HOST=0.0.0.0
ENV PORT=8080

COPY --from=build /app/app.jar ./app.jar
COPY --from=build /app/frontend ./frontend

EXPOSE 8080

CMD ["java", "-jar", "/app/app.jar"]
