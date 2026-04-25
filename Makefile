.PHONY: build
build: lib/generator.js style.css

lib/generator.js: $(shell find src -name "*.ts")
	npx rollup --config rollup.config.js

style.css: style.scss
	npx sass style.scss:style.css

dist: clean lib/generator.js style.css index.html
	mkdir -p dist/lib
	cp lib/generator.js dist/lib/generator.js
	cp style.css index.html dist

PHONY: package
package: dist
	rm -rf ./html
	mkdir -p ./html

	cp -r dist/* ./html

	@echo "Docker content ready in ./html"

.PHONY: clean
clean:
	rm -rf dist
	rm -rf lib style.css
	rm -rf ./html

.PHONY: lint
lint:
	npx tslint -c tslint.json 'src/**/*.ts' --fix

