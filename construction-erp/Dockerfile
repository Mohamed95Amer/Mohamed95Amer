FROM odoo:18.0

USER root
COPY requirements-oca.txt /tmp/requirements-oca.txt
RUN pip3 install \
    --no-cache-dir \
    --break-system-packages \
    --trusted-host pypi.org \
    --trusted-host files.pythonhosted.org \
    -r /tmp/requirements-oca.txt

USER odoo
